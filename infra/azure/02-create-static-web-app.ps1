param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$StaticWebAppName,
    [Parameter(Mandatory = $true)][string]$RepositoryUrl,
    [Parameter(Mandatory = $true)][string]$BackendApiBase,
    [string]$Location = "eastus2",
    [string]$Branch = "main",
    [string]$AppLocation = "frontend",
    [string]$OutputLocation = "build",
    [string]$OutputPath = "$PSScriptRoot\azure-frontend.outputs.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

az extension add --name staticwebapp --upgrade --only-show-errors

$exists = $true
az staticwebapp show --resource-group $ResourceGroup --name $StaticWebAppName *> $null
if ($LASTEXITCODE -ne 0) {
    $exists = $false
}

if (-not $exists) {
    az staticwebapp create `
        --resource-group $ResourceGroup `
        --name $StaticWebAppName `
        --location $Location `
        --source $RepositoryUrl `
        --branch $Branch `
        --app-location $AppLocation `
        --output-location $OutputLocation `
        --login-with-github
}

az staticwebapp appsettings set `
    --resource-group $ResourceGroup `
    --name $StaticWebAppName `
    --setting-names `
        "REACT_APP_API_BASE=$BackendApiBase" `
        "REACT_APP_DASHBOARD_SEED=false"

$frontendUrl = az staticwebapp show `
    --resource-group $ResourceGroup `
    --name $StaticWebAppName `
    --query defaultHostname -o tsv

$outputs = [ordered]@{
    resourceGroup = $ResourceGroup
    staticWebAppName = $StaticWebAppName
    frontendUrl = "https://$frontendUrl"
    backendApiBase = $BackendApiBase
}

$json = $outputs | ConvertTo-Json -Depth 4
if ($OutputPath) {
    $resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $outputDir = Split-Path -Parent $resolvedOutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    Set-Content -Path $resolvedOutputPath -Value $json -Encoding UTF8
    Write-Host "Wrote frontend outputs to $resolvedOutputPath"
}

Write-Host "Frontend URL: https://$frontendUrl"
Write-Host "Add this value to backend CORS_ORIGINS and redeploy backend: https://$frontendUrl"
$json
