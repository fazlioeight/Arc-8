param(
    [string]$SubscriptionId    = $env:AZURE_SUBSCRIPTION_ID,
    [string]$ResourceGroup     = "nexora-chat-rg",
    [string]$AcrName           = "nexorachatacr65700",
    [string]$KeyVaultName      = "nexora-chat-kv",
    [string]$ContainerEnvName  = "nexora-chat-env-v2",

    [string]$RunnerAppName     = "nexora-runner",
    [string]$ImageRepo         = "nexora-runner",
    [string]$ImageTag,                                     # default: timestamp
    [string]$GitHubRepo        = "Nexora-Lab-Co/nexora-platform",
    [string]$RunnerLabels      = "self-hosted,linux,nexora-vnet",
    [string]$RunnerName        = "nexora-runner-aca",
    [string]$KvPatSecretName   = "github-runner-pat",

    [decimal]$Cpu              = 0.5,
    [string]$Memory            = "1.0Gi",
    [switch]$SkipImageBuild
)

# Provisions a Nexora self-hosted GitHub Actions runner as a Container App
# in the existing nexora-chat-env. The runner reaches nexora-chat-kv via
# the same private endpoint the chat workload uses; no new networking is
# required.
#
# Steps (all idempotent):
#   1. Build the runner image with `az acr build` (server-side; no local Docker)
#   2. Ensure the runner Container App exists with a system-assigned MI
#   3. Grant the MI AcrPull on the ACR and Key Vault Secrets User on the KV
#   4. Create the github-runner-pat KV secret with a placeholder if absent
#   5. Wire the KV secret into the Container App as the GH_PAT env var
#
# After this script completes, the operator MUST set the real PAT value in
# Key Vault and restart the runner Container App. See
# docs/RUNBOOK_SELF_HOSTED_RUNNER.md for the exact commands.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Suppress the benign "WARNING: ..." stderr lines from the containerapp
# extension that would otherwise make PowerShell treat them as errors.
$env:AZURE_CORE_ONLY_SHOW_ERRORS = "true"

# Force UTF-8 stdout so `az acr build` log streaming doesn't crash with
# 'charmap codec can't encode' when Docker / apt print non-ASCII chars
# (arrows, box-drawing, etc). Same pattern as deploy-to-azure.ps1.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONIOENCODING = "utf-8"

if (-not $ImageTag) {
    $ImageTag = Get-Date -Format "yyyyMMdd-HHmmss"
}

function Require-AzCli {
    az version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI is required. Install it, then run 'az login'."
    }
}

# Throw on any non-zero exit from a native az call. PowerShell's
# $ErrorActionPreference="Stop" does NOT halt on native-command failure,
# so every state-changing az call needs an explicit guard.
function Assert-AzOk {
    param([string]$Op)
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed ($Op). See output above."
    }
}

# PS 5.1 turns `az` stderr into NativeCommandError under $ErrorActionPreference="Stop".
# Locally drop to SilentlyContinue so a 404 probe is just $false instead of throwing.
function Test-AzExists {
    param([scriptblock]$Probe)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        & $Probe *> $null
        return ($LASTEXITCODE -eq 0)
    } finally {
        $ErrorActionPreference = $prev
    }
}

Require-AzCli

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

# Sanity-check target resources upfront so we fail fast with a clear message
# instead of confusingly mid-script.
az group show -n $ResourceGroup --output none
Assert-AzOk "resource group $ResourceGroup not found"
az acr show -n $AcrName -g $ResourceGroup --output none
Assert-AzOk "ACR $AcrName not found"
az keyvault show -n $KeyVaultName -g $ResourceGroup --output none
Assert-AzOk "Key Vault $KeyVaultName not found"
az containerapp env show -n $ContainerEnvName -g $ResourceGroup --output none
Assert-AzOk "Container Apps env $ContainerEnvName not found"

$AcrServer  = az acr show -n $AcrName -g $ResourceGroup --query loginServer -o tsv
$AcrId      = az acr show -n $AcrName -g $ResourceGroup --query id -o tsv
$KvId       = az keyvault show -n $KeyVaultName -g $ResourceGroup --query id -o tsv
$KvUri      = az keyvault show -n $KeyVaultName -g $ResourceGroup --query properties.vaultUri -o tsv
$Image      = "$AcrServer/${ImageRepo}:$ImageTag"

# ── 1. Build the image ────────────────────────────────────────────────────
$BuildContext = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "runner"
if (-not (Test-Path (Join-Path $BuildContext "Dockerfile"))) {
    throw "Expected Dockerfile at $BuildContext but didn't find one."
}

if ($SkipImageBuild) {
    Write-Host "Skipping image build (--SkipImageBuild). Using $Image (assumed to exist)."
} else {
    # Queue with --no-wait, then poll. We avoid streaming logs entirely
    # because on Windows PowerShell it crashes with `'charmap' codec can't
    # encode '→'` whenever the build prints a Unicode arrow (any apt-get
    # progress line). The run ID isn't returned to stdout under --no-wait,
    # so we capture the queue timestamp and pick the newest run after.
    Write-Host "Queueing image build for $Image (server-side via az acr build, --no-wait)..."
    $queueTime = (Get-Date).ToUniversalTime()
    az acr build `
        --registry $AcrName `
        --image "${ImageRepo}:$ImageTag" `
        --image "${ImageRepo}:latest" `
        --file (Join-Path $BuildContext "Dockerfile") `
        --no-logs `
        --no-wait `
        $BuildContext *> $null
    Assert-AzOk "queue az acr build"

    # Find our run: the newest run whose createTime is >= $queueTime.
    $runId = $null
    for ($i = 0; $i -lt 6 -and -not $runId; $i++) {
        Start-Sleep -Seconds 5
        $candidates = az acr task list-runs --registry $AcrName --top 5 --query "[].{id:runId, createTime:createTime}" -o json | ConvertFrom-Json
        foreach ($c in $candidates) {
            if ([DateTime]::Parse($c.createTime).ToUniversalTime() -ge $queueTime.AddSeconds(-2)) {
                $runId = $c.id
                break
            }
        }
    }
    if (-not $runId) { throw "Could not identify the queued ACR build run within 30s." }
    Write-Host "Queued build $runId. Polling for completion..."

    do {
        Start-Sleep -Seconds 15
        $status = az acr task show-run --registry $AcrName --run-id $runId --query status -o tsv
        Write-Host "  build $runId status: $status"
    } while ($status -eq "Running" -or $status -eq "Queued" -or $status -eq "Started")

    if ($status -ne "Succeeded") {
        Write-Host ""
        Write-Host "Build $runId did not succeed (status=$status). Dumping log:" -ForegroundColor Yellow
        # --no-format disables colorama so the raw log bytes bypass the
        # Windows cp1252 round-trip that crashes log streaming.
        $logFile = Join-Path $env:TEMP "acr-build-$runId.log"
        az acr task logs --registry $AcrName --run-id $runId --no-format *> $logFile
        Write-Host "Last 100 lines:"
        Get-Content $logFile -Tail 100
        throw "Image build failed. Full log: $logFile"
    }
    Write-Host "Build $runId succeeded."
}

# ── 2. KV secret for the GitHub PAT ───────────────────────────────────────
$patSecretExists = Test-AzExists { az keyvault secret show --vault-name $KeyVaultName --name $KvPatSecretName }
if (-not $patSecretExists) {
    Write-Host "Creating placeholder KV secret $KvPatSecretName (must be overwritten with a real PAT)..."
    az keyvault secret set `
        --vault-name $KeyVaultName `
        --name $KvPatSecretName `
        --value "REPLACE_ME_WITH_REAL_PAT" | Out-Null
    Assert-AzOk "create kv secret $KvPatSecretName"
    $script:NeedsPatBackfill = $true
} else {
    Write-Host "KV secret $KvPatSecretName already exists; leaving value untouched."
    $script:NeedsPatBackfill = $false
}

# ── 3. Container App (system-assigned MI + KV ref + image pull via MI) ────
$kvSecretUri = "$KvUri" + "secrets/$KvPatSecretName"

$appExists = Test-AzExists { az containerapp show -n $RunnerAppName -g $ResourceGroup }
if (-not $appExists) {
    Write-Host "Creating Container App $RunnerAppName..."
    # Create with a system-assigned identity first, then grant AcrPull, then
    # reconfigure with the image. Required because the registry credential
    # check happens during create, and the MI doesn't exist yet on the first
    # call. We start with a public Microsoft image as a no-op placeholder.
    # Omit --ingress entirely to disable ingress (the flag only accepts
    # internal | external; ACA defaults to no ingress when not specified).
    az containerapp create `
        --name $RunnerAppName `
        --resource-group $ResourceGroup `
        --environment $ContainerEnvName `
        --image "mcr.microsoft.com/azure-cli:latest" `
        --command "sleep" --args "infinity" `
        --min-replicas 1 `
        --max-replicas 1 `
        --cpu $Cpu `
        --memory $Memory `
        --system-assigned | Out-Null
    Assert-AzOk "create containerapp $RunnerAppName"
} else {
    Write-Host "Container App $RunnerAppName already exists; will update."
    # Ensure system-assigned identity is set.
    $identityType = az containerapp show -n $RunnerAppName -g $ResourceGroup --query "identity.type" -o tsv
    if (-not $identityType -or $identityType -eq "None") {
        Write-Host "Assigning system-assigned identity to $RunnerAppName..."
        az containerapp identity assign -n $RunnerAppName -g $ResourceGroup --system-assigned | Out-Null
        Assert-AzOk "assign system identity"
    }
}

$RunnerPrincipalId = az containerapp show -n $RunnerAppName -g $ResourceGroup --query "identity.principalId" -o tsv
if (-not $RunnerPrincipalId) {
    throw "Container App $RunnerAppName has no system-assigned principalId. Investigate before retrying."
}

# ── 4. Role grants (idempotent) ───────────────────────────────────────────
function Grant-Role {
    param(
        [string]$Principal,
        [string]$Role,
        [string]$Scope
    )
    $existing = az role assignment list --assignee $Principal --role $Role --scope $Scope --query "[].id" -o tsv
    if (-not $existing) {
        Write-Host "Granting $Role to $Principal on $Scope..."
        az role assignment create --assignee $Principal --role $Role --scope $Scope | Out-Null
        Assert-AzOk "grant $Role on $Scope"
    } else {
        Write-Host "Role $Role already granted to $Principal on $Scope."
    }
}

Grant-Role -Principal $RunnerPrincipalId -Role "AcrPull" -Scope $AcrId
Grant-Role -Principal $RunnerPrincipalId -Role "Key Vault Secrets User" -Scope $KvId

# Wait briefly for AAD/ARM propagation -- otherwise the subsequent
# `containerapp update` can fail with `UNAUTHORIZED: authentication required`
# from the registry on the very first run.
Start-Sleep -Seconds 20

# ── 5. Wire KV secret ref + env vars + the real image -----------------------
# az containerapp secret set's --secrets parameter accepts repeated
# `name=value` entries. KV-ref secrets use `keyvaultref` + `identityref`.
Write-Host "Wiring KV secret reference for $KvPatSecretName..."
az containerapp secret set `
    --name $RunnerAppName `
    --resource-group $ResourceGroup `
    --secrets "gh-pat=keyvaultref:$kvSecretUri,identityref:system" | Out-Null
Assert-AzOk "wire kv secret ref"

Write-Host "Updating Container App $RunnerAppName to use image $Image..."
az containerapp registry set `
    --name $RunnerAppName `
    --resource-group $ResourceGroup `
    --server $AcrServer `
    --identity system | Out-Null
Assert-AzOk "set registry identity"

az containerapp update `
    --name $RunnerAppName `
    --resource-group $ResourceGroup `
    --image $Image `
    --cpu $Cpu `
    --memory $Memory `
    --min-replicas 1 `
    --max-replicas 1 `
    --command "/usr/local/bin/entrypoint.sh" `
    --set-env-vars `
        "RUNNER_REPO_URL=https://github.com/$GitHubRepo" `
        "RUNNER_NAME=$RunnerName" `
        "RUNNER_LABELS=$RunnerLabels" `
        "GH_PAT=secretref:gh-pat" | Out-Null
Assert-AzOk "update containerapp image / env"

Write-Host ""
Write-Host "Done."
Write-Host "  Container App:   $RunnerAppName"
Write-Host "  Image:           $Image"
Write-Host "  Principal ID:    $RunnerPrincipalId"
Write-Host "  Registered as:   $RunnerName"
Write-Host "  Labels:          $RunnerLabels"
Write-Host ""
if ($script:NeedsPatBackfill) {
    Write-Host "NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Create a fine-grained PAT at https://github.com/settings/personal-access-tokens/new"
    Write-Host "     - Resource owner: Nexora-Lab-Co"
    Write-Host "     - Repository: nexora-platform"
    Write-Host "     - Permissions: Administration (Read and write)"
    Write-Host "  2. Store it in Key Vault:"
    Write-Host "     az keyvault secret set --vault-name $KeyVaultName --name $KvPatSecretName --value <PAT>"
    Write-Host "  3. Restart the runner so it picks up the new value:"
    Write-Host "     az containerapp revision restart -n $RunnerAppName -g $ResourceGroup --revision (az containerapp show -n $RunnerAppName -g $ResourceGroup --query 'properties.latestRevisionName' -o tsv)"
    Write-Host "  4. Confirm it registered: https://github.com/$GitHubRepo/settings/actions/runners"
} else {
    Write-Host "Restart the runner so it picks up the new image / config:"
    Write-Host "  az containerapp revision restart -n $RunnerAppName -g $ResourceGroup --revision (az containerapp show -n $RunnerAppName -g $ResourceGroup --query 'properties.latestRevisionName' -o tsv)"
}
