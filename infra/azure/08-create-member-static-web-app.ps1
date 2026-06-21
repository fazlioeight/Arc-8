<#
.SYNOPSIS
  Create / configure the member-portal SPA Static Web App (frontend-member).

.DESCRIPTION
  Mirrors 02-create-static-web-app.ps1 for the member SPA. The SPA is served
  same-origin behind Front Door (route /*), with /api/member/* routed to the
  edge Container App — so REACT_APP_API_BASE is the Front Door member hostname
  (no CORS). Pass the Front Door endpoint host once it exists; before that you
  can point at the SWA's own host for a smoke test.
#>
param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [string]$StaticWebAppName = "nexora-member-portal-spa",
    [Parameter(Mandatory = $true)][string]$RepositoryUrl,
    [Parameter(Mandatory = $true)][string]$MemberApiBase,   # e.g. https://nexora-member.<hash>.azurefd.net
    [string]$TenantKey = "prominencehealth",
    [string]$Location = "eastus2",
    [string]$Branch = "main",
    [string]$AppLocation = "frontend-member",
    [string]$OutputLocation = "build"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($SubscriptionId) { az account set --subscription $SubscriptionId }
az extension add --name staticwebapp --upgrade --only-show-errors

$exists = $true
az staticwebapp show --resource-group $ResourceGroup --name $StaticWebAppName *> $null
if ($LASTEXITCODE -ne 0) { $exists = $false }

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

# Build-time env for the member SPA (CRA reads REACT_APP_* at build).
az staticwebapp appsettings set `
    --resource-group $ResourceGroup `
    --name $StaticWebAppName `
    --setting-names `
        "REACT_APP_API_BASE=$MemberApiBase" `
        "REACT_APP_TENANT_KEY=$TenantKey"

$frontendUrl = az staticwebapp show `
    --resource-group $ResourceGroup `
    --name $StaticWebAppName `
    --query defaultHostname -o tsv

Write-Host "Member SPA URL: https://$frontendUrl"
Write-Host "Front Door should route /* to this SWA host and /api/member/* to the edge Container App."
