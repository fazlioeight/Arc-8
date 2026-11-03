param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [string]$ResourceGroup = "rg-arc8-prod",
    [string]$Location = "eastus2",
    [string]$NamePrefix = "arc8",
    [Parameter(Mandatory = $true)][string]$RepositoryUrl,
    [string]$Branch = "main",
    [string]$StaticWebAppName = "arc8-portal",
    [string]$BackendAppName = "arc8-api",
    [string]$ImageTag = "prod-001",
    [string]$PostgresAdminUser = "arc8admin",
    [string]$PostgresAdminPassword = $env:ARC8_POSTGRES_ADMIN_PASSWORD,
    [string]$TenantKey = "prominencehealth",
    [string]$TenantName = "ProminenceHealth",
    [string]$InitialAdminEmail = "",
    [string]$InitialAdminPassword = $env:ARC8_INITIAL_ADMIN_PASSWORD,
    [string]$AzureTenantId = $env:ARC8_AZURE_TENANT_ID,
    [string]$AzureClientId = $env:ARC8_AZURE_CLIENT_ID,
    [string]$AzureClientSecret = $env:ARC8_AZURE_CLIENT_SECRET,
    [string]$AzureAuthScopes = "openid profile email",
    [string]$AzureAuthEnabled = $(if ($env:ARC8_AZURE_AUTH_ENABLED) { $env:ARC8_AZURE_AUTH_ENABLED } elseif ($env:ARC8_AZURE_TENANT_ID -and $env:ARC8_AZURE_CLIENT_ID -and $env:ARC8_AZURE_CLIENT_SECRET) { "true" } else { "false" }),
    [string]$OutputDirectory = "$PSScriptRoot"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

if (-not $PostgresAdminPassword) {
    throw "Set ARC8_POSTGRES_ADMIN_PASSWORD or pass -PostgresAdminPassword."
}

$foundationOutput = Join-Path $OutputDirectory "azure-foundation.outputs.json"
$backendOutput = Join-Path $OutputDirectory "azure-backend.outputs.json"
$frontendOutput = Join-Path $OutputDirectory "azure-frontend.outputs.json"
$finalOutput = Join-Path $OutputDirectory "azure-deployment.outputs.json"

Write-Host "Step 1/4: Creating Azure foundation resources..."
& "$PSScriptRoot\00-provision-foundation.ps1" `
    -SubscriptionId $SubscriptionId `
    -ResourceGroup $ResourceGroup `
    -Location $Location `
    -NamePrefix $NamePrefix `
    -PostgresAdminUser $PostgresAdminUser `
    -PostgresAdminPassword $PostgresAdminPassword `
    -OutputPath $foundationOutput

$foundation = Get-Content -Raw $foundationOutput | ConvertFrom-Json

Write-Host "Step 2/4: Building and deploying backend..."
& "$PSScriptRoot\01-deploy-backend-containerapp.ps1" `
    -SubscriptionId $SubscriptionId `
    -ResourceGroup $foundation.resourceGroup `
    -AcrName $foundation.acrName `
    -ContainerAppEnvironment $foundation.containerAppEnvironment `
    -KeyVaultName $foundation.keyVaultName `
    -BackendAppName $BackendAppName `
    -ImageTag $ImageTag `
    -TenantKey $TenantKey `
    -TenantName $TenantName `
    -InitialAdminEmail $InitialAdminEmail `
    -InitialAdminPassword $InitialAdminPassword `
    -AzureTenantId $AzureTenantId `
    -AzureClientId $AzureClientId `
    -AzureClientSecret $AzureClientSecret `
    -AzureAuthScopes $AzureAuthScopes `
    -AzureAuthEnabled $AzureAuthEnabled `
    -OutputPath $backendOutput

$backend = Get-Content -Raw $backendOutput | ConvertFrom-Json

Write-Host "Step 3/4: Creating Static Web App..."
& "$PSScriptRoot\02-create-static-web-app.ps1" `
    -SubscriptionId $SubscriptionId `
    -ResourceGroup $foundation.resourceGroup `
    -StaticWebAppName $StaticWebAppName `
    -RepositoryUrl $RepositoryUrl `
    -BackendApiBase $backend.backendUrl `
    -Location $Location `
    -Branch $Branch `
    -OutputPath $frontendOutput

$frontend = Get-Content -Raw $frontendOutput | ConvertFrom-Json

Write-Host "Step 4/4: Redeploying backend with frontend CORS origin..."
& "$PSScriptRoot\01-deploy-backend-containerapp.ps1" `
    -SubscriptionId $SubscriptionId `
    -ResourceGroup $foundation.resourceGroup `
    -AcrName $foundation.acrName `
    -ContainerAppEnvironment $foundation.containerAppEnvironment `
    -KeyVaultName $foundation.keyVaultName `
    -BackendAppName $BackendAppName `
    -ImageTag "$ImageTag-cors" `
    -CorsOrigin $frontend.frontendUrl `
    -TenantKey $TenantKey `
    -TenantName $TenantName `
    -AzureTenantId $AzureTenantId `
    -AzureClientId $AzureClientId `
    -AzureClientSecret $AzureClientSecret `
    -AzureAuthScopes $AzureAuthScopes `
    -AzureAuthEnabled $AzureAuthEnabled `
    -OutputPath $backendOutput

$final = [ordered]@{
    foundation = $foundation
    backend = (Get-Content -Raw $backendOutput | ConvertFrom-Json)
    frontend = $frontend
}

$json = $final | ConvertTo-Json -Depth 8
Set-Content -Path $finalOutput -Value $json -Encoding UTF8

Write-Host "Deployment complete."
Write-Host "Backend: $($final.backend.backendUrl)"
Write-Host "Frontend: $($final.frontend.frontendUrl)"
Write-Host "Outputs: $finalOutput"
$json
