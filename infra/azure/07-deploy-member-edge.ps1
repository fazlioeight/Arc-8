<#
.SYNOPSIS
  Build + deploy the member-portal EDGE Container App (internet-facing BFF proxy).

.DESCRIPTION
  This is the public face of the member portal (Option A — trust boundary first).
  It runs the thin reverse proxy in edge/member-portal/ and forwards ONLY
  /api/member/* to the internal backend over the Container Apps environment's
  private network.

  Trust-boundary guarantees enforced here:
    * NO database secrets / connection strings are set on this app — ever.
    * NO SECRET_KEY / field-encryption key — the backend validates member tokens.
    * Scale-to-zero (min 0) for spiky enrollment/EOB traffic.
    * Its own system-assigned managed identity (used only for ACR pull).

  Front Door + WAF sit in front of this app (see bicep/modules/front-door.bicep);
  this script does NOT make the app the public entry on its own.

.NOTES
  Mirrors infra/azure/01-deploy-backend-containerapp.ps1 conventions. Idempotent.
#>
param(
    [string]$ResourceGroup       = $env:AZURE_RESOURCE_GROUP,
    [string]$ContainerAppEnvironment = "nexora-chat-env-v2",
    [string]$AcrName             = $env:AZURE_ACR_NAME,
    [string]$KeyVaultName        = "nexora-chat-kv",
    [string]$EdgeAppName         = "nexora-member-portal",
    [string]$BackendAppName      = "nexora-chat-v2",
    [string]$ImageName           = "nexora-member-edge",
    [string]$FrontDoorId         = "",   # set to lock the edge to our Front Door (X-Azure-FDID)
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not $ResourceGroup) { throw "ResourceGroup is required (set AZURE_RESOURCE_GROUP)." }
if (-not $AcrName)       { throw "AcrName is required (set AZURE_ACR_NAME)." }

$acrServer = az acr show -n $AcrName --query loginServer -o tsv

# --- Build image (ACR remote build) ---------------------------------------
$tag = Get-Date -Format "yyyyMMddHHmmss"
$fullImage = "${acrServer}/${ImageName}:$tag"
if (-not $SkipBuild) {
    Write-Host "Building edge image via ACR: ${ImageName}:$tag"
    Push-Location (Join-Path $ProjectRoot "edge/member-portal")
    try {
        az acr build --registry $AcrName --image "${ImageName}:$tag" --output none .
    } finally {
        Pop-Location
    }
} else {
    $tag = az acr repository show-tags -n $AcrName --repository $ImageName --orderby time_desc --top 1 -o tsv
    $fullImage = "${acrServer}/${ImageName}:$tag"
    Write-Host "Reusing latest edge image: $fullImage"
}

# --- Resolve the backend's INTERNAL FQDN (private, in-environment) ----------
# Apps in the same Container Apps environment can reach each other over the
# environment's private network. We target the backend by its app FQDN so member
# traffic never traverses the public internet between edge and backend.
$backendFqdn = az containerapp show --resource-group $ResourceGroup --name $BackendAppName `
    --query "properties.configuration.ingress.fqdn" -o tsv
if (-not $backendFqdn) { throw "Could not resolve backend FQDN for $BackendAppName." }
$backendInternalUrl = "https://$backendFqdn"

# Edge config — ENV only. The ONLY secret the edge may hold is the narrow
# edge->backend authorizer (X-Edge-Auth); it must never get DB creds / signing
# keys. Fetched from Key Vault if present (enforcement stays dormant until both
# this and the backend have it).
$envVars = @(
    "MEMBER_BACKEND_INTERNAL_URL=$backendInternalUrl",
    "ALLOWED_PATH_PREFIX=/api/member/",
    "PROXY_TIMEOUT_SECONDS=30"
)
if ($FrontDoorId) { $envVars += "EXPECTED_FRONT_DOOR_ID=$FrontDoorId" }

$secretArgs = @()
$edgeSecret = az keyvault secret show --vault-name $KeyVaultName --name "member-edge-shared-secret" --query value -o tsv 2>$null
if ($edgeSecret) {
    $secretArgs = @("member-edge-shared-secret=$edgeSecret")
    $envVars += "MEMBER_EDGE_SHARED_SECRET=secretref:member-edge-shared-secret"
    Write-Host "Edge will present X-Edge-Auth (member-edge-shared-secret)."
} else {
    Write-Host "member-edge-shared-secret not in Key Vault yet; edge runs without it (guard stays dormant)."
}

$appExists = $true
az containerapp show --resource-group $ResourceGroup --name $EdgeAppName *> $null
if ($LASTEXITCODE -ne 0) { $appExists = $false }

if (-not $appExists) {
    Write-Host "Creating edge Container App $EdgeAppName (scale-to-zero)..."
    $createArgs = @(
        "--resource-group", $ResourceGroup,
        "--name", $EdgeAppName,
        "--environment", $ContainerAppEnvironment,
        "--image", $fullImage,
        "--system-assigned",
        "--registry-server", $acrServer,
        "--registry-identity", "system",
        "--target-port", "8000",
        "--ingress", "external",
        "--min-replicas", "0",
        "--max-replicas", "5",
        "--cpu", "0.25",
        "--memory", "0.5Gi",
        "--env-vars"
    ) + $envVars
    if ($secretArgs.Count -gt 0) { $createArgs += @("--secrets") + $secretArgs }
    az containerapp create @createArgs
} else {
    Write-Host "Updating edge Container App $EdgeAppName..."
    if ($secretArgs.Count -gt 0) {
        az containerapp secret set --resource-group $ResourceGroup --name $EdgeAppName --secrets $secretArgs
    }
    az containerapp update --resource-group $ResourceGroup --name $EdgeAppName --image $fullImage --set-env-vars $envVars
}

# Guard rail: the edge may ONLY hold the edge-auth token. Fail loudly if any
# broad credential (DB DSN / signing / encryption key) ever lands here.
$secretNames = az containerapp secret list --resource-group $ResourceGroup --name $EdgeAppName --query "[].name" -o tsv 2>$null
$forbidden = @()
foreach ($name in ($secretNames -split "`n" | Where-Object { $_ })) {
    if ($name -match "db|database|control|tenant|secret-key|field-encryption|connection") {
        $forbidden += $name
    }
}
if ($forbidden.Count -gt 0) {
    throw "SECURITY: edge app $EdgeAppName holds forbidden secret(s): $($forbidden -join ', '). The internet-facing tier must never hold DB creds or signing keys. Aborting."
}

$edgeFqdn = az containerapp show --resource-group $ResourceGroup --name $EdgeAppName `
    --query "properties.configuration.ingress.fqdn" -o tsv
Write-Host "Edge deployed: https://$edgeFqdn (proxies /api/member/* -> $backendInternalUrl)"
Write-Host "NOTE: put Azure Front Door + WAF in front of this FQDN (bicep/modules/front-door.bicep)."
