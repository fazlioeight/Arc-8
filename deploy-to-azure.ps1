param(
    # Container App: the existing 'nexora-chat' app is reused in place.
    [string]$AppName            = "nexora-chat",
    [string]$ResourceGroup      = "nexora-chat-rg",
    [string]$AcrName            = "nexorachatacr65700",
    [string]$ImageName          = "nexora-platform",
    [string]$ContainerEnvName   = "nexora-chat-env",
    [string]$KeyVaultName       = "nexora-chat-kv",
    [string]$LogWorkspaceName   = "nexora-chat-logs",
    [string]$AppInsightsName    = "nexora-chat-insights",

    # Postgres: reuse existing nexora-chat-pg server, add new databases.
    [string]$PostgresServerName = "nexora-chat-pg",
    [string]$PostgresAdminUser  = "nexoraadmin",
    [string]$ControlDbName      = "nexora_control",
    [string]$TenantDbName       = "nexora_tenant_prominencehealth",

    # Initial tenant + admin user.
    [string]$TenantKey          = "prominencehealth",
    [string]$TenantSlug         = "prominencehealth",
    [string]$TenantName         = "ProminenceHealth",
    [string]$InitialAdminEmail  = "admin@nexora.local",

    # Static Web App (frontend). SWA has a limited set of regions; westus2 is OK
    # for an app whose backend is in westus3.
    [string]$StaticWebAppName   = "nexora-platform-portal",
    [string]$StaticWebAppLocation = "westus2",

    # Workbook storage (preserve nexora-chat's existing share).
    [string]$StorageMountName   = "workbooks",

    # Skips for partial re-runs.
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipMigrations,

    [switch]$FollowLogs
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Force UTF-8 stdout so 'az acr build' log streaming doesn't crash with
# 'charmap codec can't encode' when Docker prints non-ASCII chars.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = "utf-8"

# Suppress containerapp extension WARNING lines on stderr — under PS 5.1 with
# $ErrorActionPreference="Stop", those warnings get wrapped as ErrorRecords
# and abort the script even on exit code 0.
$env:AZURE_CORE_ONLY_SHOW_ERRORS = "true"

function Write-Phase([string]$Title) {
    Write-Host ""
    Write-Host "== $Title ==================================" -ForegroundColor Cyan
}

function Test-Cmd([string]$Cmd) {
    if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
        throw "$Cmd is required on PATH."
    }
}

# Run an 'az ...' lookup that may legitimately return "not found" (e.g.
# checking whether a secret/DB/job exists before creating it). Returns the
# trimmed stdout on success, or $null on any error / empty output.
function Invoke-AzQuiet {
    param([scriptblock]$Block)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $Block 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        if ($null -eq $output) { return $null }
        $value = ($output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($value)) { return $null }
        return $value
    } finally {
        $ErrorActionPreference = $prev
        $global:LASTEXITCODE = 0
    }
}

Test-Cmd az
Test-Cmd docker
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot
Write-Host "Project root: $ProjectRoot"

Write-Phase "Azure CLI / target check"
$Account = Invoke-AzQuiet { az account show --query "user.name" -o tsv }
if (-not $Account) { az login; $Account = az account show --query "user.name" -o tsv }
Write-Host "Logged in as: $Account"

# Verify target resources exist.
az group show -n $ResourceGroup --output none
az containerapp show -n $AppName -g $ResourceGroup --output none
az acr show -n $AcrName -g $ResourceGroup --output none
az keyvault show -n $KeyVaultName -g $ResourceGroup --output none
az postgres flexible-server show -n $PostgresServerName -g $ResourceGroup --output none
Write-Host "All target resources present."

$AcrServer = az acr show -n $AcrName -g $ResourceGroup --query loginServer -o tsv
$PgFqdn    = "$PostgresServerName.postgres.database.azure.com"
$AppFqdn   = az containerapp show -n $AppName -g $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv
$Location  = az group show -n $ResourceGroup --query location -o tsv

# == Phase 1: Secrets + databases ============================================─
Write-Phase "Phase 1: Secrets and database provisioning"

# Postgres admin password was previously stored by deploy-nexora.ps1.
$PgAdminPassword = Invoke-AzQuiet { az keyvault secret show --vault-name $KeyVaultName --name "postgres-admin-password" --query value -o tsv }
if (-not $PgAdminPassword) {
    throw "Key Vault secret 'postgres-admin-password' is missing. The nexora-chat deploy created this -- run that first or set the password manually."
}

# Generate (or reuse) SECRET_KEY.
$SecretKey = Invoke-AzQuiet { az keyvault secret show --vault-name $KeyVaultName --name "platform-secret-key" --query value -o tsv }
if (-not $SecretKey) {
    Write-Host "Generating platform SECRET_KEY..."
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $SecretKey = [Convert]::ToBase64String($bytes)
    az keyvault secret set --vault-name $KeyVaultName --name "platform-secret-key" --value $SecretKey --output none | Out-Null
}

# Generate (or reuse) initial admin password.
$InitialAdminPassword = Invoke-AzQuiet { az keyvault secret show --vault-name $KeyVaultName --name "platform-initial-admin-password" --query value -o tsv }
if (-not $InitialAdminPassword) {
    Write-Host "Generating initial admin password..."
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $InitialAdminPassword = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''
    $InitialAdminPassword = $InitialAdminPassword.Substring(0, 24)
    az keyvault secret set --vault-name $KeyVaultName --name "platform-initial-admin-password" --value $InitialAdminPassword --output none | Out-Null
}

# Create databases on the existing PG server.
foreach ($Db in @($ControlDbName, $TenantDbName)) {
    $existing = Invoke-AzQuiet { az postgres flexible-server db show -g $ResourceGroup --server-name $PostgresServerName --database-name $Db --query id -o tsv }
    if (-not $existing) {
        Write-Host "Creating database '$Db' on $PostgresServerName..."
        az postgres flexible-server db create `
            -g $ResourceGroup `
            --server-name $PostgresServerName `
            --database-name $Db `
            --output none
    } else {
        Write-Host "Database '$Db' already exists."
    }
}

# Build DSNs and store in Key Vault.
# asyncpg + ssl=require for FastAPI runtime; psycopg + sslmode=require for the
# DDL helper (psycopg uses a different keyword and value).
$ControlDsnAsyncpg = "postgresql+asyncpg://${PostgresAdminUser}:${PgAdminPassword}@${PgFqdn}:5432/${ControlDbName}?ssl=require"
$TenantDsnAsyncpg  = "postgresql+asyncpg://${PostgresAdminUser}:${PgAdminPassword}@${PgFqdn}:5432/${TenantDbName}?ssl=require"
# Sync DSN for Alembic migrations (env.py strips +asyncpg but keeps query
# string, so we need 'sslmode=require' rather than asyncpg's 'ssl=require').
$ControlDsnSync    = "postgresql://${PostgresAdminUser}:${PgAdminPassword}@${PgFqdn}:5432/${ControlDbName}?sslmode=require"
$TenantDsnPsycopg  = "postgresql://${PostgresAdminUser}:${PgAdminPassword}@${PgFqdn}:5432/${TenantDbName}?sslmode=require"

az keyvault secret set --vault-name $KeyVaultName --name "platform-control-db-url" --value $ControlDsnAsyncpg --output none | Out-Null
az keyvault secret set --vault-name $KeyVaultName --name "platform-tenant-db-url"  --value $TenantDsnAsyncpg  --output none | Out-Null
az keyvault secret set --vault-name $KeyVaultName --name "platform-control-db-url-sync"   --value $ControlDsnSync   --output none | Out-Null
az keyvault secret set --vault-name $KeyVaultName --name "platform-tenant-db-url-psycopg" --value $TenantDsnPsycopg --output none | Out-Null
Write-Host "DSNs persisted to Key Vault."

# == Phase 2: Backend image build ============================================-
if (-not $SkipBackend) {
    Write-Phase "Phase 2: Backend image build (ACR remote build)"
    $Tag = Get-Date -Format "yyyyMMddHHmmss"
    $FullImage = "${AcrServer}/${ImageName}:$Tag"

    Push-Location (Join-Path $ProjectRoot "backend")
    try {
        Write-Host "Submitting ACR build (this takes a few minutes)..."
        $prev = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        az acr build --registry $AcrName --image "${ImageName}:$Tag" --output none . 2>&1 | ForEach-Object {
            # Strip any bytes the console can't render rather than crashing.
            try { Write-Host $_ } catch { Write-Host "[unprintable line suppressed]" }
        }
        $buildExit = $LASTEXITCODE
        $ErrorActionPreference = $prev
    } finally {
        Pop-Location
    }

    # Verify the image actually landed in ACR. The CLI log streamer can crash
    # mid-build (encoding issues on Windows) while the build itself succeeds
    # server-side, so we check the registry rather than trust the exit code.
    # If the image isn't there yet, the build may still be running on the
    # server -- poll the most recent task run until it reaches a terminal state
    # before giving up.
    $pushed = Invoke-AzQuiet { az acr repository show -n $AcrName --image "${ImageName}:$Tag" --query name -o tsv }
    if (-not $pushed) {
        Write-Host "Image not yet in ACR; polling task run to completion..."
        $deadline = (Get-Date).AddMinutes(15)
        do {
            Start-Sleep -Seconds 10
            $runStatus = Invoke-AzQuiet { az acr task list-runs -r $AcrName --top 1 --query "[0].status" -o tsv }
            Write-Host "  task run status: $runStatus"
            if ((Get-Date) -gt $deadline) {
                throw "Timed out waiting for ACR build of '${ImageName}:$Tag' (last status: $runStatus)."
            }
        } while ($runStatus -eq "Running" -or $runStatus -eq "Queued")
        $pushed = Invoke-AzQuiet { az acr repository show -n $AcrName --image "${ImageName}:$Tag" --query name -o tsv }
    }
    if (-not $pushed) {
        throw "ACR build did not push '${ImageName}:$Tag' (CLI exit $buildExit, run status $runStatus). Check 'az acr task list-runs -r $AcrName --top 5'."
    }
    Write-Host "Image built and pushed: $FullImage"
    $env:NEXORA_PLATFORM_IMAGE = $FullImage
} else {
    Write-Host "Phase 2 skipped (-SkipBackend)."
    $FullImage = $env:NEXORA_PLATFORM_IMAGE
    if (-not $FullImage) {
        # Reuse the latest image already in ACR.
        $LatestTag = Invoke-AzQuiet { az acr repository show-tags -n $AcrName --repository $ImageName --orderby time_desc --top 1 -o tsv }
        if (-not $LatestTag) { throw "No image to deploy. Re-run without -SkipBackend." }
        $FullImage = "${AcrServer}/${ImageName}:$LatestTag"
        Write-Host "Reusing latest image: $FullImage"
    }
}

# == Phase 3: DB migrations (Alembic + tenant DDL) ============================
if (-not $SkipMigrations) {
    Write-Phase "Phase 3: Migrations and tenant provisioning"

    $MigrationJob = "nexora-platform-migrations"
    $TenantDdlJob = "nexora-platform-tenant-ddl"
    $TenantProvJob = "nexora-platform-tenant-provision"

    # Grant the Container App's managed identity Key Vault access for any future
    # use; KV-backed secrets here are just read once and passed to jobs by value.
    $PrincipalId = Invoke-AzQuiet { az containerapp identity show -n $AppName -g $ResourceGroup --query principalId -o tsv }
    if (-not $PrincipalId) {
        $PrincipalId = az containerapp identity assign -n $AppName -g $ResourceGroup --system-assigned --query principalId -o tsv
    }

    # Use the same ACR admin credentials nexora-chat uses (admin user enabled,
    # password lives in the ACR itself). Jobs created with this auth model
    # don't need a separate AcrPull role grant on each job's managed identity.
    $AcrPassword = az acr credential show -n $AcrName --query "passwords[0].value" -o tsv

    # --- 3a: Alembic against control DB --------------------------------------
    function Invoke-EnsureJob([string]$JobName, [string[]]$EnvVars, [string[]]$JobSecrets, [string]$JobCommand, [string[]]$JobArgs) {
        $exists = Invoke-AzQuiet { az containerapp job show -n $JobName -g $ResourceGroup --query id -o tsv }
        $registrySecret = "acr-password=$AcrPassword"
        $allSecrets = @($registrySecret) + $JobSecrets
        if (-not $exists) {
            Write-Host "Creating job '$JobName'..."
            az containerapp job create `
                -n $JobName -g $ResourceGroup `
                --environment $ContainerEnvName `
                --image $FullImage `
                --trigger-type Manual `
                --replica-timeout 1800 `
                --replica-retry-limit 1 `
                --registry-server $AcrServer `
                --registry-username $AcrName `
                --registry-password "secretref:acr-password" `
                --secrets $allSecrets `
                --env-vars $EnvVars `
                --command $JobCommand `
                --args $JobArgs `
                --output none
        } else {
            Write-Host "Updating job '$JobName' image + env..."
            az containerapp job secret set `
                -n $JobName -g $ResourceGroup `
                --secrets $allSecrets `
                --output none
            az containerapp job update `
                -n $JobName -g $ResourceGroup `
                --image $FullImage `
                --set-env-vars $EnvVars `
                --output none
        }
        Write-Host "Starting job '$JobName'..."
        az containerapp job start -n $JobName -g $ResourceGroup --output none
    }

    # Use ControlBase.metadata.create_all rather than Alembic. The migration
    # chain mixes control tables with tenant tables (works in dev's single
    # SQLite DB, breaks against separated prod DBs). For a fresh control DB
    # there's no history to preserve, so create_all is the right tool.
    Invoke-EnsureJob `
        -JobName $MigrationJob `
        -JobSecrets @(
            "control-db-url=$ControlDsnAsyncpg",
            "secret-key=$SecretKey"
        ) `
        -EnvVars @(
            "ENVIRONMENT=production",
            "PYTHONPATH=/app",
            "SECRET_KEY=secretref:secret-key",
            "CONTROL_DATABASE_URL=secretref:control-db-url"
        ) `
        -JobCommand "python" `
        -JobArgs @("scripts/apply_control_ddl.py")

    # --- 3b: Tenant DDL (create_tables.sql) ----------------------------------
    Invoke-EnsureJob `
        -JobName $TenantDdlJob `
        -JobSecrets @(
            "tenant-db-url-psycopg=$TenantDsnPsycopg"
        ) `
        -EnvVars @(
            "PYTHONPATH=/app",
            "TENANT_DATABASE_URL_PSYCOPG=secretref:tenant-db-url-psycopg"
        ) `
        -JobCommand "python" `
        -JobArgs @("scripts/apply_tenant_ddl.py")

    # --- 3c: provision_initial_tenant.py -------------------------------------
    Invoke-EnsureJob `
        -JobName $TenantProvJob `
        -JobSecrets @(
            "control-db-url=$ControlDsnAsyncpg",
            "tenant-db-url=$TenantDsnAsyncpg",
            "secret-key=$SecretKey",
            "initial-admin-password=$InitialAdminPassword"
        ) `
        -EnvVars @(
            "ENVIRONMENT=production",
            "PYTHONPATH=/app",
            "SECRET_KEY=secretref:secret-key",
            "CONTROL_DATABASE_URL=secretref:control-db-url",
            "DEFAULT_TENANT_DATABASE_URL=secretref:tenant-db-url",
            "INITIAL_TENANT_KEY=$TenantKey",
            "INITIAL_TENANT_SLUG=$TenantSlug",
            "INITIAL_TENANT_NAME=$TenantName",
            "INITIAL_ADMIN_EMAIL=$InitialAdminEmail",
            "INITIAL_ADMIN_PASSWORD=secretref:initial-admin-password"
        ) `
        -JobCommand "python" `
        -JobArgs @("scripts/provision_initial_tenant.py")

    function Wait-JobCompletion([string]$JobName, [int]$TimeoutSec = 900) {
        Write-Host "Waiting for job '$JobName'..."
        $deadline = (Get-Date).AddSeconds($TimeoutSec)
        $execName = $null
        while (-not $execName -and (Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 3
            $execName = Invoke-AzQuiet { az containerapp job execution list -n $JobName -g $ResourceGroup --query "[0].name" -o tsv }
        }
        if (-not $execName) { throw "No execution appeared for job '$JobName' within $TimeoutSec s." }
        while ((Get-Date) -lt $deadline) {
            $status = Invoke-AzQuiet { az containerapp job execution show -n $JobName -g $ResourceGroup --job-execution-name $execName --query "properties.status" -o tsv }
            if ($status -eq "Succeeded") {
                Write-Host "  '$JobName' / $execName : Succeeded"
                return
            }
            if ($status -in @("Failed", "Stopped", "Degraded")) {
                throw "Job '$JobName' execution '$execName' ended with status: $status"
            }
            Start-Sleep -Seconds 10
        }
        throw "Job '$JobName' did not complete within $TimeoutSec s."
    }

    Wait-JobCompletion -JobName $MigrationJob
    Wait-JobCompletion -JobName $TenantDdlJob
    Wait-JobCompletion -JobName $TenantProvJob
} else {
    Write-Host "Phase 3 skipped (-SkipMigrations)."
}

# == Phase 4: Update Container App with platform image + env vars ============-
if (-not $SkipBackend) {
    Write-Phase "Phase 4: Container App update (replace nexora-chat in place)"

    # Application Insights connection string (already created by chat deploy).
    $ConnStr = Invoke-AzQuiet { az monitor app-insights component show --app $AppInsightsName -g $ResourceGroup --query connectionString -o tsv }
    if (-not $ConnStr) { $ConnStr = "" }

    # The Anthropic key is already in KV as 'anthropic-api-key' from the prior
    # nexora-chat deploy. The platform's chat module reads it from this env var.
    $KvUrl = "https://$KeyVaultName.vault.azure.net"

    # Build env var + secrets lists. CORS will be updated again in Phase 6
    # once we know the Static Web App URL.
    $ContainerSecrets = @(
        "platform-secret-key=$SecretKey",
        "platform-control-db-url=$ControlDsnAsyncpg",
        "platform-tenant-db-url=$TenantDsnAsyncpg"
    )
    $ContainerEnvVars = @(
        "ENVIRONMENT=production",
        "HIPAA_MODE=true",
        "ALLOW_DUMMY_LOGIN=false",
        "SECRET_KEY=secretref:platform-secret-key",
        "CONTROL_DATABASE_URL=secretref:platform-control-db-url",
        "DEFAULT_TENANT_DATABASE_URL=secretref:platform-tenant-db-url",
        "CORS_ORIGINS=[]",
        "KEY_VAULT_URL=$KvUrl",
        "WORKBOOK_DATA_DIR=/mnt/workbooks",
        "AUDIT_LOG_PATH=/tmp/audit.log",
        "CLAUDE_MODEL=claude-sonnet-4-6",
        "APPLICATIONINSIGHTS_CONNECTION_STRING=$ConnStr"
    )

    # Anthropic API key as a Key Vault reference. The Container App's
    # managed identity already has Key Vault Secrets User on this KV
    # (set up by deploy-nexora.ps1), so this resolves at runtime.
    az containerapp secret set `
        -n $AppName -g $ResourceGroup `
        --secrets "anthropic-api-key=keyvaultref:https://$KeyVaultName.vault.azure.net/secrets/anthropic-api-key,identityref:system" `
        --output none

    $ContainerEnvVars += "ANTHROPIC_API_KEY=secretref:anthropic-api-key"

    Write-Host "Pushing new image + secrets + env vars..."
    az containerapp secret set -n $AppName -g $ResourceGroup --secrets $ContainerSecrets --output none
    az containerapp update `
        -n $AppName -g $ResourceGroup `
        --image $FullImage `
        --set-env-vars $ContainerEnvVars `
        --output none

    # Backend listens on 8000 (gunicorn -b 0.0.0.0:8000). nexora-chat used the
    # same port, so ingress.targetPort doesn't need changing -- but make sure.
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    az containerapp ingress update -n $AppName -g $ResourceGroup --target-port 8000 --output none 2>$null
    $ErrorActionPreference = $prev
    $global:LASTEXITCODE = 0

    Write-Host "Container App updated to platform image."
} else {
    Write-Host "Phase 4 skipped (-SkipBackend)."
}

# == Phase 5: Static Web App (frontend) ======================================-
$FrontendUrl = $null
if (-not $SkipFrontend) {
    Write-Phase "Phase 5: Static Web App"

    az extension add --name staticwebapp --upgrade --only-show-errors

    $swaExists = Invoke-AzQuiet { az staticwebapp show -n $StaticWebAppName -g $ResourceGroup --query id -o tsv }
    if (-not $swaExists) {
        Write-Host "Creating Static Web App '$StaticWebAppName' in $StaticWebAppLocation..."
        # No --source flag = no GitHub linkage; we deploy via the SWA CLI.
        az staticwebapp create `
            -n $StaticWebAppName -g $ResourceGroup `
            --location $StaticWebAppLocation `
            --sku Free `
            --output none
    }

    $FrontendUrl = "https://" + (az staticwebapp show -n $StaticWebAppName -g $ResourceGroup --query defaultHostname -o tsv)
    Write-Host "Static Web App URL: $FrontendUrl"

    # Wire the SWA's app settings (these are visible to the SWA-hosted SPA
    # via the Azure SWA runtime; for CRA the real build-time replacement
    # happens during 'npm run build' below).
    az staticwebapp appsettings set `
        -n $StaticWebAppName -g $ResourceGroup `
        --setting-names "REACT_APP_API_BASE=https://$AppFqdn" `
        --output none

    # Get the deployment token used by the SWA CLI for unauthenticated
    # artifact pushes.
    $DeployToken = az staticwebapp secrets list -n $StaticWebAppName -g $ResourceGroup --query "properties.apiKey" -o tsv
    if (-not $DeployToken) { throw "Could not retrieve SWA deployment token." }

    # Build the React app. CRA bakes REACT_APP_* into the bundle at build time.
    Write-Phase "Phase 5b: npm build"
    Push-Location (Join-Path $ProjectRoot "frontend")
    try {
        $env:REACT_APP_API_BASE = "https://$AppFqdn"
        $env:REACT_APP_DEFAULT_TENANT = $TenantKey
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing npm dependencies..."
            npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        }
        Write-Host "Building React app (REACT_APP_API_BASE=$env:REACT_APP_API_BASE)..."
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed." }
    } finally {
        Pop-Location
    }

    Write-Phase "Phase 5c: SWA upload"
    $BuildDir = Join-Path $ProjectRoot "frontend\build"
    if (-not (Test-Path $BuildDir)) { throw "Frontend build directory not found: $BuildDir" }

    # @azure/static-web-apps-cli ships a 'swa' CLI for direct upload. Run it
    # from inside the build dir so its swa-cli.config.json lookup doesn't
    # walk back up to the repo root and hit unreadable directories like
    # .pytest_cache (which errors out the upload with EPERM scandir).
    Write-Host "Uploading bundle to Static Web App..."
    Push-Location $BuildDir
    try {
        npx --yes @azure/static-web-apps-cli deploy . `
            --deployment-token $DeployToken `
            --env production `
            --verbose
        if ($LASTEXITCODE -ne 0) { throw "SWA deploy failed." }
    } finally {
        Pop-Location
    }

    Write-Host "Frontend deployed to $FrontendUrl"
} else {
    Write-Host "Phase 5 skipped (-SkipFrontend)."
    $existing = Invoke-AzQuiet { az staticwebapp show -n $StaticWebAppName -g $ResourceGroup --query defaultHostname -o tsv }
    if ($existing) { $FrontendUrl = "https://$existing" } else { $FrontendUrl = $null }
}

# == Phase 6: CORS update ====================================================-
if ($FrontendUrl) {
    Write-Phase "Phase 6: Update backend CORS for SWA origin"
    # Pass the URL bare. PowerShell + az.exe argument splitting eats inner
    # double quotes, so a JSON array like ["https://..."] arrives as
    # [https://...] in the container. The backend's parse_cors_origins
    # validator (config.py) accepts JSON arrays, comma-separated strings,
    # and bare URLs alike, so a bare URL is the simplest robust form.
    az containerapp update -n $AppName -g $ResourceGroup `
        --set-env-vars "CORS_ORIGINS=$FrontendUrl" `
        --output none
    Write-Host "CORS updated: $FrontendUrl"
}

# == Final summary ==========================================================─-
Write-Phase "Deployment summary"
Write-Host "Backend (Container App): https://$AppFqdn"
if ($FrontendUrl) {
    Write-Host "Frontend (Static Web App): $FrontendUrl"
}
Write-Host "Tenant key for X-Tenant-Key header: $TenantKey"
Write-Host "Initial admin: $InitialAdminEmail"
Write-Host "Initial admin password: stored in Key Vault as 'platform-initial-admin-password'"
Write-Host ""
Write-Host "Retrieve admin password with:"
Write-Host "  az keyvault secret show --vault-name $KeyVaultName --name platform-initial-admin-password --query value -o tsv"

if ($FollowLogs) {
    Write-Phase "Streaming Container App logs"
    az containerapp logs show -n $AppName -g $ResourceGroup --type console --tail 200 --follow
}
