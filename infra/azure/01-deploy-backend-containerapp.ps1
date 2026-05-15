param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$AcrName,
    [Parameter(Mandatory = $true)][string]$ContainerAppEnvironment,
    [Parameter(Mandatory = $true)][string]$KeyVaultName,
    [string]$BackendAppName = "nexora-api",
    [string]$MigrationJobName = "nexora-control-migrations",
    [string]$TenantProvisionJobName = "nexora-initial-tenant",
    [string]$ImageTag = "latest",
    [string]$CorsOrigin = "",
    [string]$TenantKey = "prominencehealth",
    [string]$TenantName = "ProminenceHealth",
    [string]$InitialAdminEmail = "",
    [string]$InitialAdminPassword = $env:NEXORA_INITIAL_ADMIN_PASSWORD,
    [string]$AzureTenantId = $env:NEXORA_AZURE_TENANT_ID,
    [string]$AzureClientId = $env:NEXORA_AZURE_CLIENT_ID,
    [string]$AzureClientSecret = $env:NEXORA_AZURE_CLIENT_SECRET,
    [string]$AzureAuthScopes = "openid profile email",
    [string]$AzureAuthEnabled = $(if ($env:NEXORA_AZURE_AUTH_ENABLED) { $env:NEXORA_AZURE_AUTH_ENABLED } elseif ($env:NEXORA_AZURE_TENANT_ID -and $env:NEXORA_AZURE_CLIENT_ID -and $env:NEXORA_AZURE_CLIENT_SECRET) { "true" } else { "false" }),
    [string]$OutputPath = "$PSScriptRoot\azure-backend.outputs.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

az extension add --name containerapp --upgrade --only-show-errors

$acrLoginServer = az acr show --resource-group $ResourceGroup --name $AcrName --query loginServer -o tsv
$image = "${acrLoginServer}/nexora-api:${ImageTag}"

Push-Location "$PSScriptRoot\..\..\backend"
try {
    az acr build --registry $AcrName --image "nexora-api:${ImageTag}" .
}
finally {
    Pop-Location
}

$secretKey = az keyvault secret show --vault-name $KeyVaultName --name secret-key --query value -o tsv
$controlDbUrl = az keyvault secret show --vault-name $KeyVaultName --name control-db-url --query value -o tsv
$tenantDbUrl = az keyvault secret show --vault-name $KeyVaultName --name tenant-db-url --query value -o tsv
$redisUrl = az keyvault secret show --vault-name $KeyVaultName --name redis-url --query value -o tsv
$storageConnection = az keyvault secret show --vault-name $KeyVaultName --name storage-connection-string --query value -o tsv
$serviceBusConnection = az keyvault secret show --vault-name $KeyVaultName --name servicebus-connection-string --query value -o tsv

$corsOrigins = if ($CorsOrigin) { "[`"$CorsOrigin`"]" } else { "[]" }

if ($AzureAuthEnabled -eq "true" -and (-not $AzureTenantId -or -not $AzureClientId -or -not $AzureClientSecret)) {
    throw "Azure auth is enabled. Provide AzureTenantId, AzureClientId, and AzureClientSecret."
}

$containerSecrets = @(
    "secret-key=$secretKey",
    "control-db-url=$controlDbUrl",
    "tenant-db-url=$tenantDbUrl",
    "redis-url=$redisUrl",
    "storage-connection-string=$storageConnection",
    "servicebus-connection-string=$serviceBusConnection"
)

$containerEnvVars = @(
    "ENVIRONMENT=production",
    "HIPAA_MODE=true",
    "ALLOW_DUMMY_LOGIN=false",
    "SECRET_KEY=secretref:secret-key",
    "CONTROL_DATABASE_URL=secretref:control-db-url",
    "DEFAULT_TENANT_DATABASE_URL=secretref:tenant-db-url",
    "REDIS_URL=secretref:redis-url",
    "AZURE_STORAGE_CONNECTION_STRING=secretref:storage-connection-string",
    "BACKGROUND_QUEUE_URL=secretref:servicebus-connection-string",
    "CORS_ORIGINS=$corsOrigins",
    "AUDIT_LOG_PATH=/tmp/audit.log",
    "AZURE_AUTH_ENABLED=$AzureAuthEnabled"
)

if ($AzureAuthEnabled -eq "true") {
    $containerSecrets += "azure-client-secret=$AzureClientSecret"
    $containerEnvVars += "AZURE_TENANT_ID=$AzureTenantId"
    $containerEnvVars += "AZURE_CLIENT_ID=$AzureClientId"
    $containerEnvVars += "AZURE_CLIENT_SECRET=secretref:azure-client-secret"
    $containerEnvVars += "AZURE_AUTH_SCOPES=$AzureAuthScopes"
}

$appExists = $true
az containerapp show --resource-group $ResourceGroup --name $BackendAppName *> $null
if ($LASTEXITCODE -ne 0) {
    $appExists = $false
}

if (-not $appExists) {
    az containerapp create `
        --resource-group $ResourceGroup `
        --name $BackendAppName `
        --environment $ContainerAppEnvironment `
        --image $image `
        --system-assigned `
        --registry-server $acrLoginServer `
        --registry-identity system `
        --target-port 8000 `
        --ingress external `
        --min-replicas 1 `
        --max-replicas 5 `
        --cpu 1.0 `
        --memory 2.0Gi `
        --secrets $containerSecrets `
        --env-vars $containerEnvVars
}
else {
    az containerapp secret set `
        --resource-group $ResourceGroup `
        --name $BackendAppName `
        --secrets $containerSecrets

    az containerapp update `
        --resource-group $ResourceGroup `
        --name $BackendAppName `
        --image $image `
        --set-env-vars $containerEnvVars
}

$backendUrl = az containerapp show `
    --resource-group $ResourceGroup `
    --name $BackendAppName `
    --query "properties.configuration.ingress.fqdn" -o tsv

$jobExists = $true
az containerapp job show --resource-group $ResourceGroup --name $MigrationJobName *> $null
if ($LASTEXITCODE -ne 0) {
    $jobExists = $false
}

if (-not $jobExists) {
    az containerapp job create `
        --resource-group $ResourceGroup `
        --name $MigrationJobName `
        --environment $ContainerAppEnvironment `
        --image $image `
        --trigger-type Manual `
        --replica-timeout 1800 `
        --replica-retry-limit 1 `
        --system-assigned `
        --registry-server $acrLoginServer `
        --registry-identity system `
        --secrets `
            "secret-key=$secretKey" `
            "control-db-url=$controlDbUrl" `
        --env-vars `
            "ENVIRONMENT=production" `
            "SECRET_KEY=secretref:secret-key" `
            "CONTROL_DATABASE_URL=secretref:control-db-url" `
        --command "alembic" `
        --args "upgrade" "head"
}
else {
    az containerapp job update `
        --resource-group $ResourceGroup `
        --name $MigrationJobName `
        --image $image
}

Write-Host "Starting Alembic migration job..."
az containerapp job start --resource-group $ResourceGroup --name $MigrationJobName

$tenantJobExists = $true
az containerapp job show --resource-group $ResourceGroup --name $TenantProvisionJobName *> $null
if ($LASTEXITCODE -ne 0) {
    $tenantJobExists = $false
}

$tenantSecrets = @(
    "secret-key=$secretKey",
    "control-db-url=$controlDbUrl",
    "tenant-db-url=$tenantDbUrl"
)
if ($InitialAdminPassword) {
    $tenantSecrets += "initial-admin-password=$InitialAdminPassword"
}

$tenantEnvVars = @(
    "ENVIRONMENT=production",
    "SECRET_KEY=secretref:secret-key",
    "CONTROL_DATABASE_URL=secretref:control-db-url",
    "DEFAULT_TENANT_DATABASE_URL=secretref:tenant-db-url",
    "INITIAL_TENANT_KEY=$TenantKey",
    "INITIAL_TENANT_SLUG=$TenantKey",
    "INITIAL_TENANT_NAME=$TenantName"
)
if ($InitialAdminEmail) {
    $tenantEnvVars += "INITIAL_ADMIN_EMAIL=$InitialAdminEmail"
}
if ($InitialAdminPassword) {
    $tenantEnvVars += "INITIAL_ADMIN_PASSWORD=secretref:initial-admin-password"
}

if (-not $tenantJobExists) {
    az containerapp job create `
        --resource-group $ResourceGroup `
        --name $TenantProvisionJobName `
        --environment $ContainerAppEnvironment `
        --image $image `
        --trigger-type Manual `
        --replica-timeout 1800 `
        --replica-retry-limit 1 `
        --system-assigned `
        --registry-server $acrLoginServer `
        --registry-identity system `
        --secrets $tenantSecrets `
        --env-vars $tenantEnvVars `
        --command "python" `
        --args "scripts/provision_initial_tenant.py"
}
else {
    az containerapp job update `
        --resource-group $ResourceGroup `
        --name $TenantProvisionJobName `
        --image $image
}

Write-Host "Starting initial tenant provision job..."
az containerapp job start --resource-group $ResourceGroup --name $TenantProvisionJobName

$outputs = [ordered]@{
    resourceGroup = $ResourceGroup
    backendAppName = $BackendAppName
    backendUrl = "https://$backendUrl"
    migrationJobName = $MigrationJobName
    tenantProvisionJobName = $TenantProvisionJobName
    image = $image
}

$json = $outputs | ConvertTo-Json -Depth 4
if ($OutputPath) {
    $resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $outputDir = Split-Path -Parent $resolvedOutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    Set-Content -Path $resolvedOutputPath -Value $json -Encoding UTF8
    Write-Host "Wrote backend outputs to $resolvedOutputPath"
}

Write-Host "Backend URL: https://$backendUrl"
Write-Host "Use this value for frontend REACT_APP_API_BASE: https://$backendUrl"
$json
