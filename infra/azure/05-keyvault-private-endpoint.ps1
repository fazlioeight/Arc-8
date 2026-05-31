param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$KeyVaultName,
    [Parameter(Mandatory = $true)][string]$VnetResourceGroup,
    [Parameter(Mandatory = $true)][string]$VnetName,
    [string]$PeSubnetName = "pe-subnet",
    [string]$PrivateEndpointName,
    [string]$PrivateDnsZoneName = "privatelink.vaultcore.azure.net",
    [string]$DnsZoneResourceGroup,
    [switch]$DisablePublicAccess
)

# Public-network remediation for an Azure Key Vault. Creates a Private
# Endpoint into an existing pe-subnet, a privatelink DNS zone, and the
# VNet DNS link. Idempotent: re-running skips anything that already
# exists.
#
# Cross-region note: the KV and the VNet can be in different regions.
# The PE NIC lives in the subnet's region; KV traffic from inside the
# VNet still routes via that PE regardless of where the KV lives.
#
# Pass -DisablePublicAccess only after every consumer can reach the
# vault through the VNet. After this flag flips, IP-allowlist edits
# stop working too (the firewall section becomes inert), so make sure
# any operator who needs direct access has a VNet path (jump host,
# point-to-site VPN, etc).

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $PrivateEndpointName) {
    $PrivateEndpointName = "$KeyVaultName-pe"
}
if (-not $DnsZoneResourceGroup) {
    $DnsZoneResourceGroup = $ResourceGroup
}

function Require-AzCli {
    az version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI is required. Install it, then run 'az login'."
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

Write-Host "Resolving Key Vault $KeyVaultName in $ResourceGroup..."
$kvId = az keyvault show -g $ResourceGroup -n $KeyVaultName --query id -o tsv
if (-not $kvId) {
    throw "Could not find Key Vault $KeyVaultName in $ResourceGroup."
}

Write-Host "Resolving pe-subnet $PeSubnetName in $VnetName ($VnetResourceGroup)..."
$peSubnetId = az network vnet subnet show -g $VnetResourceGroup --vnet-name $VnetName -n $PeSubnetName --query id -o tsv
if (-not $peSubnetId) {
    throw "Could not find subnet $PeSubnetName in vnet $VnetName."
}

$peNetPolicies = az network vnet subnet show -g $VnetResourceGroup --vnet-name $VnetName -n $PeSubnetName --query privateEndpointNetworkPolicies -o tsv
if ($peNetPolicies -ne "Disabled") {
    Write-Host "Disabling privateEndpointNetworkPolicies on $PeSubnetName (was '$peNetPolicies')..."
    az network vnet subnet update -g $VnetResourceGroup --vnet-name $VnetName -n $PeSubnetName --disable-private-endpoint-network-policies true | Out-Null
}

$vnetId = az network vnet show -g $VnetResourceGroup -n $VnetName --query id -o tsv

# 1. Private DNS zone
$zoneExists = Test-AzExists { az network private-dns zone show -g $DnsZoneResourceGroup -n $PrivateDnsZoneName }
if (-not $zoneExists) {
    Write-Host "Creating private DNS zone $PrivateDnsZoneName in $DnsZoneResourceGroup..."
    az network private-dns zone create -g $DnsZoneResourceGroup -n $PrivateDnsZoneName | Out-Null
} else {
    Write-Host "Private DNS zone $PrivateDnsZoneName already exists; skipping create."
}

# 2. VNet link on the DNS zone
$linkName = "$VnetName-link"
$linkExists = Test-AzExists { az network private-dns link vnet show -g $DnsZoneResourceGroup -n $linkName --zone-name $PrivateDnsZoneName }
if (-not $linkExists) {
    Write-Host "Linking $VnetName to private DNS zone $PrivateDnsZoneName..."
    az network private-dns link vnet create `
        -g $DnsZoneResourceGroup `
        -n $linkName `
        --zone-name $PrivateDnsZoneName `
        --virtual-network $vnetId `
        --registration-enabled false | Out-Null
} else {
    Write-Host "VNet link $linkName already exists; skipping create."
}

# 3. Private endpoint
$peExists = Test-AzExists { az network private-endpoint show -g $ResourceGroup -n $PrivateEndpointName }
if (-not $peExists) {
    Write-Host "Creating private endpoint $PrivateEndpointName -> $KeyVaultName..."
    # --subnet accepts the full subnet resource id, which is how we point at
    # a subnet living in a different resource group than the PE itself.
    az network private-endpoint create `
        -g $ResourceGroup `
        -n $PrivateEndpointName `
        --subnet $peSubnetId `
        --private-connection-resource-id $kvId `
        --group-id vault `
        --connection-name "$PrivateEndpointName-conn" | Out-Null
} else {
    Write-Host "Private endpoint $PrivateEndpointName already exists; skipping create."
}

# 4. DNS zone group on the PE so A records auto-populate.
# Use `list` rather than `show` here: `show` for a missing zone-group has
# returned exit 0 with empty output in some az CLI versions, which made
# the existence probe report a false positive. Filter in PowerShell instead
# of a JMESPath --query, because cmd.exe (which wraps az.cmd) mangles the
# `?`, `[`, and `==` characters.
$zoneGroupName = "default"
$existingGroups = az network private-endpoint dns-zone-group list -g $ResourceGroup --endpoint-name $PrivateEndpointName --query "[].name" -o tsv
$zoneGroupMatches = @($existingGroups -split "`r?`n" | Where-Object { $_ -eq $zoneGroupName })
if ($zoneGroupMatches.Count -eq 0) {
    $zoneIdForGroup = az network private-dns zone show -g $DnsZoneResourceGroup -n $PrivateDnsZoneName --query id -o tsv
    Write-Host "Wiring DNS zone group on $PrivateEndpointName..."
    az network private-endpoint dns-zone-group create `
        -g $ResourceGroup `
        --endpoint-name $PrivateEndpointName `
        -n $zoneGroupName `
        --private-dns-zone $zoneIdForGroup `
        --zone-name vault | Out-Null
} else {
    Write-Host "DNS zone group already wired on $PrivateEndpointName."
}

# 5. Read back the PE IP for reporting
$peNicId = az network private-endpoint show -g $ResourceGroup -n $PrivateEndpointName --query "networkInterfaces[0].id" -o tsv
$peIp = az network nic show --ids $peNicId --query "ipConfigurations[0].privateIPAddress" -o tsv
Write-Host "Private endpoint $PrivateEndpointName bound IP: $peIp"

if ($DisablePublicAccess) {
    Write-Host ""
    Write-Host "Disabling public network access on $KeyVaultName..."
    az keyvault update -g $ResourceGroup -n $KeyVaultName --public-network-access Disabled | Out-Null
} else {
    Write-Host ""
    Write-Host "Public access NOT disabled. Re-run with -DisablePublicAccess once every"
    Write-Host "consumer (Container Apps env, CI, operators) can reach the vault via the VNet."
}

Write-Host ""
Write-Host "Done. Vault FQDN should now resolve to $peIp from inside $VnetName."
