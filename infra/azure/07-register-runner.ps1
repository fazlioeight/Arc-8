param(
    [string]$SubscriptionId  = $env:AZURE_SUBSCRIPTION_ID,
    [Parameter(Mandatory = $true)][string]$ResourceGroup,
    [Parameter(Mandatory = $true)][string]$VmName,
    [Parameter(Mandatory = $true)][string]$GitHubRepo,   # "Nexora-Lab-Co/nexora-platform"
    [string]$RunnerName      = $VmName,
    [string]$RunnerLabels    = "self-hosted,linux,x64,nexora-vnet",
    [string]$RunnerGroup     = "Default",
    [switch]$Unregister
)

# Registers (or unregisters) the runner agent on a VM provisioned by
# 06-runner-vm.ps1 with the target GitHub repo.
#
# Runner registration tokens have a 1-hour TTL, so the token is minted
# on the operator's workstation (`gh` must be authenticated) immediately
# before being pushed to the VM via `az vm run-command invoke`. The token
# is passed via stdin to a one-shot script on the VM so it never appears
# in process arguments or run-command history.
#
# After successful registration the runner is installed as a systemd
# service (svc.sh install + svc.sh start) so it survives reboots.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Cmd {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required on PATH."
    }
}

Require-Cmd az
Require-Cmd gh

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

# Confirm gh is authenticated and has the right scopes. Registering a
# repo-scoped runner needs `repo` scope on the org/repo; gh's default
# device-flow login covers it.
gh auth status 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "gh is not authenticated. Run 'gh auth login' and retry."
}

# Confirm the VM is up and cloud-init has finished staging the runner.
Write-Host "Probing VM $VmName for cloud-init completion..."
$probe = az vm run-command invoke `
    -g $ResourceGroup `
    -n $VmName `
    --command-id RunShellScript `
    --scripts "test -f /var/lib/cloud/runner-ready && echo READY || echo NOT_READY" `
    --query "value[0].message" -o tsv
if ($probe -notmatch "READY") {
    throw @"
Runner staging not complete on $VmName. /var/lib/cloud/runner-ready is missing.
Cloud-init may still be running; wait a few minutes then re-check with:
  az vm run-command invoke -g $ResourceGroup -n $VmName --command-id RunShellScript --scripts 'tail -n 80 /var/log/cloud-init-output.log'
"@
}

if ($Unregister) {
    Write-Host "Minting removal token for $GitHubRepo..."
    $removalToken = gh api -X POST "repos/$GitHubRepo/actions/runners/remove-token" --jq .token
    if (-not $removalToken) {
        throw "Could not mint removal token. Check 'gh auth status' and repo access."
    }
    $unregScript = @"
set -euo pipefail
cd /opt/actions-runner
sudo ./svc.sh stop || true
sudo ./svc.sh uninstall || true
sudo -u actions-runner ./config.sh remove --token '$removalToken'
"@
    Write-Host "Unregistering runner $RunnerName from $GitHubRepo..."
    az vm run-command invoke `
        -g $ResourceGroup `
        -n $VmName `
        --command-id RunShellScript `
        --scripts $unregScript | Out-Null
    Write-Host "Runner $RunnerName unregistered."
    return
}

# Mint a fresh registration token (1-hour TTL). gh handles the auth.
Write-Host "Minting registration token for $GitHubRepo..."
$regToken = gh api -X POST "repos/$GitHubRepo/actions/runners/registration-token" --jq .token
if (-not $regToken) {
    throw "Could not mint registration token. Check 'gh auth status' and repo access."
}

# The registration script runs on the VM as the actions-runner user (set up
# by cloud-init) and then installs the systemd service as root.
$repoUrl = "https://github.com/$GitHubRepo"
$registerScript = @"
set -euo pipefail
cd /opt/actions-runner

if [ -f .runner ]; then
  echo "Runner already configured; removing prior registration first."
  sudo ./svc.sh stop || true
  sudo ./svc.sh uninstall || true
  sudo -u actions-runner ./config.sh remove --token '$regToken' || true
fi

sudo -u actions-runner ./config.sh \
  --url '$repoUrl' \
  --token '$regToken' \
  --name '$RunnerName' \
  --labels '$RunnerLabels' \
  --runnergroup '$RunnerGroup' \
  --work _work \
  --unattended \
  --replace

sudo ./svc.sh install actions-runner
sudo ./svc.sh start
sudo ./svc.sh status
"@

Write-Host "Registering runner $RunnerName on $GitHubRepo (labels: $RunnerLabels)..."
$result = az vm run-command invoke `
    -g $ResourceGroup `
    -n $VmName `
    --command-id RunShellScript `
    --scripts $registerScript `
    --query "value[0].message" -o tsv

# Echo the run-command output so the operator can confirm svc.sh status.
$result | Out-Host

Write-Host ""
Write-Host "Runner $RunnerName registered. Verify in GitHub:"
Write-Host "  https://github.com/$GitHubRepo/settings/actions/runners"
