param(
    [string]$SubscriptionId    = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$VnetResourceGroup,
    [Parameter(Mandatory = $true)][string]$VnetName,

    [string]$SubnetName        = "runner-subnet",
    [string]$SubnetPrefix      = "10.20.5.0/27",
    [string]$NsgName           = "runner-nsg",
    [string]$PublicIpName      = "runner-pip",
    [string]$VmName            = "nexora-runner-1",
    [string]$VmSize            = "Standard_B2s",
    [string]$VmImage           = "Ubuntu2204",
    [string]$AdminUsername     = "azureuser",
    [string]$Location,
    [string]$CloudInitPath
)

# Idempotent provisioning of a Linux VM that hosts a self-hosted GitHub
# Actions runner inside an existing VNet, so workflows can reach VNet-only
# resources (Key Vault, Postgres) through their private endpoints.
#
# What this creates (all idempotent -- safe to re-run):
#   1. runner-subnet in $VnetName
#   2. runner-nsg (inbound deny-all, outbound allow-all), bound to the subnet
#   3. Standard SKU static public IP (outbound only -- inbound blocked by NSG)
#   4. Ubuntu 22.04 VM with the public IP attached and cloud-init applied
#
# This script DOES NOT register the runner with GitHub; the runner agent is
# only staged. Registration tokens have a 1-hour TTL, so run
# 07-register-runner.ps1 after this completes to mint a fresh token and
# register the agent as a systemd service.
#
# Cost: ~$30/mo for B2s + ~$4/mo for the public IP at westus3 list price.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $CloudInitPath) {
    $CloudInitPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "runner-cloud-init.yaml"
}
if (-not (Test-Path $CloudInitPath)) {
    throw "Cloud-init payload not found at $CloudInitPath."
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

# All runner resources live alongside the VNet they attach to, so they share
# a fate with the network they depend on. If the VNet RG is deleted, the
# runner goes with it -- which is what we want.
$ResourceGroup = $VnetResourceGroup

if (-not $Location) {
    $Location = az network vnet show -g $VnetResourceGroup -n $VnetName --query location -o tsv
    if (-not $Location) {
        throw "Could not resolve location for vnet $VnetName in $VnetResourceGroup."
    }
}
Write-Host "Target: vnet=$VnetName ($VnetResourceGroup), location=$Location"

# 1. NSG -- inbound deny-all (Azure default), outbound allow-all (default).
#    We don't add an explicit deny-inbound rule; the implicit DenyAllInbound
#    rule at priority 65500 already covers it. Outbound default is allow-all,
#    which is what the runner needs to reach github.com and management.azure.com.
$nsgExists = Test-AzExists { az network nsg show -g $ResourceGroup -n $NsgName }
if (-not $nsgExists) {
    Write-Host "Creating NSG $NsgName..."
    az network nsg create -g $ResourceGroup -n $NsgName -l $Location | Out-Null
} else {
    Write-Host "NSG $NsgName already exists; skipping create."
}

# 2. Runner subnet (no delegations, no service endpoints).
$subnetExists = Test-AzExists { az network vnet subnet show -g $VnetResourceGroup --vnet-name $VnetName -n $SubnetName }
if (-not $subnetExists) {
    Write-Host "Creating subnet $SubnetName ($SubnetPrefix) in $VnetName..."
    $nsgId = az network nsg show -g $ResourceGroup -n $NsgName --query id -o tsv
    az network vnet subnet create `
        -g $VnetResourceGroup `
        --vnet-name $VnetName `
        -n $SubnetName `
        --address-prefix $SubnetPrefix `
        --network-security-group $nsgId | Out-Null
} else {
    Write-Host "Subnet $SubnetName already exists; skipping create."
    # If the subnet pre-existed without our NSG, attach it now so reruns
    # converge on the expected state.
    $currentNsg = az network vnet subnet show -g $VnetResourceGroup --vnet-name $VnetName -n $SubnetName --query "networkSecurityGroup.id" -o tsv
    if (-not $currentNsg) {
        Write-Host "Subnet has no NSG; attaching $NsgName..."
        $nsgId = az network nsg show -g $ResourceGroup -n $NsgName --query id -o tsv
        az network vnet subnet update `
            -g $VnetResourceGroup `
            --vnet-name $VnetName `
            -n $SubnetName `
            --network-security-group $nsgId | Out-Null
    }
}

# 3. Public IP -- Standard SKU, Static. Attached to the VM for outbound only;
#    inbound is blocked by the NSG's implicit deny-all-inbound rule.
$pipExists = Test-AzExists { az network public-ip show -g $ResourceGroup -n $PublicIpName }
if (-not $pipExists) {
    Write-Host "Creating public IP $PublicIpName..."
    az network public-ip create `
        -g $ResourceGroup `
        -n $PublicIpName `
        -l $Location `
        --sku Standard `
        --allocation-method Static `
        --version IPv4 | Out-Null
} else {
    Write-Host "Public IP $PublicIpName already exists; skipping create."
}

# 4. VM. We bypass `az vm create`'s implicit NSG creation by passing
#    --nsg "" (empty string), since the NSG is already on the subnet.
#    SSH inbound is denied by the subnet NSG; management happens via
#    `az vm run-command invoke` in 07-register-runner.ps1.
$vmExists = Test-AzExists { az vm show -g $ResourceGroup -n $VmName }
if ($vmExists) {
    Write-Host "VM $VmName already exists; skipping create."
} else {
    Write-Host "Creating VM $VmName (size=$VmSize, image=$VmImage)..."
    # Generate an SSH key file in the user profile if none exists -- az vm
    # create requires one, even though SSH is blocked at the NSG level.
    $sshKeyPath = Join-Path $HOME ".ssh\nexora-runner.pub"
    $sshPrivPath = Join-Path $HOME ".ssh\nexora-runner"
    if (-not (Test-Path $sshKeyPath)) {
        Write-Host "Generating local SSH key pair at $sshPrivPath (kept for break-glass access only)..."
        New-Item -ItemType Directory -Force -Path (Split-Path $sshKeyPath) | Out-Null
        ssh-keygen -t ed25519 -f $sshPrivPath -N '""' -C "nexora-runner-breakglass" | Out-Null
    }

    az vm create `
        -g $ResourceGroup `
        -n $VmName `
        -l $Location `
        --image $VmImage `
        --size $VmSize `
        --admin-username $AdminUsername `
        --ssh-key-values $sshKeyPath `
        --vnet-name $VnetName `
        --subnet $SubnetName `
        --public-ip-address $PublicIpName `
        --public-ip-sku Standard `
        --nsg "" `
        --assign-identity `
        --os-disk-size-gb 30 `
        --storage-sku StandardSSD_LRS `
        --custom-data $CloudInitPath | Out-Null
}

# Read back the public IP and management identity for the operator runbook.
$pipAddress = az network public-ip show -g $ResourceGroup -n $PublicIpName --query ipAddress -o tsv
$vmPrincipalId = az vm show -g $ResourceGroup -n $VmName --query "identity.principalId" -o tsv

Write-Host ""
Write-Host "Done."
Write-Host "  VM:                 $VmName"
Write-Host "  Resource group:     $ResourceGroup"
Write-Host "  Public IP:          $pipAddress (outbound only; NSG denies inbound)"
Write-Host "  System-assigned MI: $vmPrincipalId"
Write-Host ""
Write-Host "Cloud-init runs on first boot (typically ~3-5 min). Watch progress with:"
Write-Host "  az vm run-command invoke -g $ResourceGroup -n $VmName --command-id RunShellScript --scripts 'tail -n 60 /var/log/cloud-init-output.log'"
Write-Host ""
Write-Host "When /var/lib/cloud/runner-ready exists, register the runner with:"
Write-Host "  ./infra/azure/07-register-runner.ps1 -ResourceGroup $ResourceGroup -VmName $VmName -GitHubRepo Nexora-Lab-Co/nexora-platform"
