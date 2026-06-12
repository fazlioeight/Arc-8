# Self-hosted GitHub Actions runner (VNet-attached)

Last reviewed: 2026-06-11

The `deploy-backend.yml` workflow's `deploy` job runs on a self-hosted
runner because `nexora-chat-kv` has public network access disabled. The
runner sits on `nexora-dev-vnet` and reaches the vault through the
existing `nexora-chat-kv-pe` private endpoint in `pe-subnet`.

The `test` job in the same workflow stays on `ubuntu-latest` (it doesn't
touch the VNet -- tests run against SQLite). The `deploy-frontend.yml`
workflow also stays on `ubuntu-latest` (uploads to Static Web Apps via a
deploy token, no VNet dependency).

## Topology

```
nexora-dev-vnet (10.20.0.0/16, westus3, rg-nexora-dev)
  aca-subnet      10.20.0.0/23   (delegated: Microsoft.App/environments)
  postgres-subnet 10.20.2.0/24   (delegated: Microsoft.DBforPostgreSQL/flexibleServers)
  default         10.20.3.0/24
  pe-subnet       10.20.4.0/24   (holds nexora-chat-kv-pe, nexora-chat-pg-pe)
  runner-subnet   10.20.5.0/27   <-- this runbook
  chat-aca-subnet 10.20.6.0/23   (delegated: Microsoft.App/environments)
```

Default DNS in the VNet resolves the privatelink zones already linked
to it (`privatelink.vaultcore.azure.net`,
`privatelink.postgres.database.azure.com`), so the runner sees the
vault's private IP without any extra configuration.

## Resources

| Resource | Name | RG |
|---|---|---|
| Subnet | `runner-subnet` (10.20.5.0/27) | rg-nexora-dev |
| NSG | `runner-nsg` | rg-nexora-dev |
| Public IP | `runner-pip` (outbound only) | rg-nexora-dev |
| VM | `nexora-runner-1` (B2s, Ubuntu 22.04) | rg-nexora-dev |

Inbound is denied at the NSG. SSH is blocked from the internet. The VM
is managed via `az vm run-command invoke`. If you ever need a shell, use
the SSH key generated at `~/.ssh/nexora-runner` and a temporary NSG rule
restricted to your current IP.

## Provisioning a new runner VM

```powershell
# 1. Create the VM, subnet, NSG, and PIP. Idempotent.
./infra/azure/06-runner-vm.ps1 `
  -VnetResourceGroup rg-nexora-dev `
  -VnetName nexora-dev-vnet

# 2. Wait for cloud-init to finish (3-5 min). Sentinel:
#    /var/lib/cloud/runner-ready
az vm run-command invoke `
  -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "test -f /var/lib/cloud/runner-ready && echo READY"

# 3. Mint a registration token and register the agent.
#    gh must be logged in with repo access.
./infra/azure/07-register-runner.ps1 `
  -ResourceGroup rg-nexora-dev `
  -VmName nexora-runner-1 `
  -GitHubRepo Nexora-Lab-Co/nexora-platform
```

Verify the runner shows up at
https://github.com/Nexora-Lab-Co/nexora-platform/settings/actions/runners
with labels `self-hosted, linux, x64, nexora-vnet` and status Idle.

## Day-to-day operations

### Tail runner logs

```powershell
az vm run-command invoke `
  -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "journalctl -u actions.runner.* -n 100 --no-pager"
```

### Update the runner agent

The agent self-updates when a new release is detected at job start, so
manual updates are rarely needed. To force an update:

```powershell
az vm run-command invoke `
  -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "cd /opt/actions-runner && sudo ./svc.sh stop && rm -f .runner-version && /usr/local/bin/install-actions-runner.sh && sudo ./svc.sh start"
```

### Restart the runner agent

```powershell
az vm run-command invoke `
  -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "cd /opt/actions-runner && sudo ./svc.sh restart && sudo ./svc.sh status"
```

### OS patching

The VM is *not* on a scheduled patch policy. Apply unattended upgrades
periodically (Ubuntu does daily security upgrades by default; verify):

```powershell
az vm run-command invoke `
  -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y dist-upgrade && DEBIAN_FRONTEND=noninteractive apt-get -y autoremove"
```

Reboot if the kernel was updated:

```powershell
az vm restart -g rg-nexora-dev -n nexora-runner-1
```

The runner systemd unit restarts automatically.

### Decommission

```powershell
# 1. Unregister from GitHub.
./infra/azure/07-register-runner.ps1 `
  -ResourceGroup rg-nexora-dev `
  -VmName nexora-runner-1 `
  -GitHubRepo Nexora-Lab-Co/nexora-platform `
  -Unregister

# 2. Delete VM and dependents (NIC, OS disk, PIP, NSG, subnet).
az vm delete -g rg-nexora-dev -n nexora-runner-1 --yes
az network public-ip delete -g rg-nexora-dev -n runner-pip
az network nsg delete -g rg-nexora-dev -n runner-nsg
az network vnet subnet delete -g rg-nexora-dev --vnet-name nexora-dev-vnet -n runner-subnet
```

## Identity model

The runner is *only* a network conduit. The OIDC service principal in
`vars.AZURE_CLIENT_ID` is what authenticates to Azure -- the runner does
not use its own managed identity for deploys. This means:

- No new RBAC grants are needed when you add a runner VM
- The same RBAC documented in [RUNBOOK_CI_IAM.md](RUNBOOK_CI_IAM.md)
  continues to apply

The VM does have a system-assigned managed identity, but it's unused at
the moment. It's there in case a future workflow wants the runner itself
(rather than the OIDC SP) to authenticate.

## Security posture

- **Inbound**: blocked by NSG. No SSH from the internet.
- **Outbound**: open (NSG default). Needed for `github.com`,
  `management.azure.com`, ACR webhook callbacks, and apt mirrors.
- **Disk**: standard SSD, not encrypted at host by default. Add
  encryption-at-host if you're storing sensitive job artifacts on disk;
  the runner's `_work` directory contains checked-out source and any
  secret values it reads from KV during a build.
- **Token handling**: registration tokens have 1-hour TTL and are passed
  to the VM via `az vm run-command invoke` stdin (not in process args).
  They are not persisted anywhere after registration.
- **Repo visibility**: this design assumes
  `Nexora-Lab-Co/nexora-platform` is *private*. Do not put a self-hosted
  runner on a public repo -- forks can submit PRs that execute on the
  runner.

## Troubleshooting

### Workflow stays queued

The runner may be offline or labels don't match.

```powershell
# Is the agent running?
az vm run-command invoke -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "systemctl status actions.runner.*.service --no-pager | head -40"

# Does GitHub see it as online?
gh api repos/Nexora-Lab-Co/nexora-platform/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

### "ForbiddenByConnection" on Key Vault reads

The runner is hitting `nexora-chat-kv.vault.azure.net` over the public
endpoint, which is blocked. Confirm DNS is resolving to the private IP:

```powershell
az vm run-command invoke -g rg-nexora-dev -n nexora-runner-1 `
  --command-id RunShellScript `
  --scripts "getent hosts nexora-chat-kv.vault.azure.net"
```

The address should fall inside `10.20.4.0/24` (the pe-subnet). If it
resolves to a public IP instead, the VNet's DNS configuration drifted --
check the VNet link on the `privatelink.vaultcore.azure.net` zone in
`rg-nexora-dev`.
