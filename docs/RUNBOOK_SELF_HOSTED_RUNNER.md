# Self-hosted GitHub Actions runner (Container App)

Last reviewed: 2026-06-11

The `deploy-backend.yml` workflow's `deploy` job runs on a self-hosted
runner because `nexora-chat-kv` has public network access disabled. The
runner lives in the existing `nexora-chat-env-v2` Container Apps environment,
which is VNet-integrated, so the runner reaches the vault through the
same `nexora-chat-kv-pe` private endpoint the chat workload uses.

A VM-based runner was attempted first but rejected by Azure's quota
auto-approval (the subscription has never hosted IaaS VMs in westus3).
Container Apps uses a separate quota pool already proven on this sub.

The `test` job in the same workflow stays on `ubuntu-latest` (no VNet
dependency -- tests run against SQLite). `deploy-frontend.yml` also stays
on `ubuntu-latest` (Static Web Apps deploy token, no VNet dependency).

## Topology

```
nexora-chat-rg (westus3)
  nexora-chat-env-v2  (Container Apps env, VNet-injected into chat-aca-subnet)
    nexora-chat    (the workload itself)
    nexora-runner  <-- this runbook

nexora-chat-kv  (public access Disabled; PE in pe-subnet/nexora-dev-vnet)
nexora-chat-pg  (public access Disabled; PE in pe-subnet/nexora-dev-vnet)
```

The Container Apps env is already linked to `privatelink.vaultcore.azure.net`
and `privatelink.postgres.database.azure.com` (chat workload uses them), so
the runner inherits VNet DNS automatically.

## Resources

| Resource | Name | RG |
|---|---|---|
| Container App | `nexora-runner` | nexora-chat-rg |
| Image | `nexorachatacr65700.azurecr.io/nexora-runner:latest` | nexora-chat-rg |
| KV secret | `github-runner-pat` | nexora-chat-rg / nexora-chat-kv |

The Container App has a system-assigned managed identity. It is granted:
- `AcrPull` on `nexorachatacr65700` (so the env can pull the image)
- `Key Vault Secrets User` on `nexora-chat-kv` (so it can read the PAT secret)

The MI is *only* used by the container itself to fetch its image and PAT.
The deploy workflow that *runs on* the runner authenticates to Azure via
OIDC as the AAD app configured in `vars.AZURE_CLIENT_ID` -- same as before.
RBAC documented in [RUNBOOK_CI_IAM.md](RUNBOOK_CI_IAM.md) is unchanged.

## First-time setup

```powershell
# 1. Provision: build image, create Container App, grant roles, wire KV ref.
#    On first run, also seeds a placeholder for the PAT secret.
./infra/azure/06-runner-containerapp.ps1

# 2. Create a fine-grained GitHub PAT
#    https://github.com/settings/personal-access-tokens/new
#    Resource owner:  Nexora-Lab-Co
#    Repository access: Only select repositories -> nexora-platform
#    Repository permissions:
#      Administration: Read and write   (needed to mint registration tokens)
#    Expiration: up to 1 year (rotate before then)

# 3. Store the PAT in Key Vault.
az keyvault secret set `
  --vault-name nexora-chat-kv `
  --name github-runner-pat `
  --value "<paste-PAT-here>"

# 4. Restart the runner so the new value is picked up. Env-var-mounted
#    secrets are only re-read on container start.
$rev = az containerapp show -n nexora-runner -g nexora-chat-rg --query 'properties.latestRevisionName' -o tsv
az containerapp revision restart -n nexora-runner -g nexora-chat-rg --revision $rev
```

Confirm the runner shows up at
https://github.com/Nexora-Lab-Co/nexora-platform/settings/actions/runners
with labels `self-hosted, linux, nexora-vnet` and status Idle.

## Image lifecycle

The image is built server-side via `az acr build`. The provisioning script
double-tags each build (date stamp + `:latest`); the Container App always
pulls `:latest`. To bump the runner agent version, edit
`infra/azure/runner/Dockerfile` (`ARG RUNNER_VERSION=...`) and re-run
`06-runner-containerapp.ps1`.

To rebuild *only* the image without touching the Container App:

```powershell
az acr build `
  --registry nexorachatacr65700 `
  --image "nexora-runner:latest" `
  --image "nexora-runner:$(Get-Date -Format yyyyMMdd-HHmmss)" `
  --file infra/azure/runner/Dockerfile `
  infra/azure/runner
```

Then restart the Container App to pick up the new image:

```powershell
$rev = az containerapp show -n nexora-runner -g nexora-chat-rg --query 'properties.latestRevisionName' -o tsv
az containerapp revision restart -n nexora-runner -g nexora-chat-rg --revision $rev
```

## Day-to-day operations

### Tail runner logs

```powershell
az containerapp logs show -n nexora-runner -g nexora-chat-rg --tail 200
```

Live follow:

```powershell
az containerapp logs show -n nexora-runner -g nexora-chat-rg --follow
```

### Restart the runner

```powershell
$rev = az containerapp show -n nexora-runner -g nexora-chat-rg --query 'properties.latestRevisionName' -o tsv
az containerapp revision restart -n nexora-runner -g nexora-chat-rg --revision $rev
```

The runner agent traps SIGTERM in its entrypoint and de-registers itself
from GitHub before exiting, so the orphan runner doesn't pile up in the
repo settings UI.

### Rotate the PAT

```powershell
# 1. Create a new PAT in GitHub with the same scopes.
# 2. Overwrite the KV secret. The new value becomes a new secret version.
az keyvault secret set `
  --vault-name nexora-chat-kv `
  --name github-runner-pat `
  --value "<new-PAT>"
# 3. Restart the runner. The container reads the new value on start.
$rev = az containerapp show -n nexora-runner -g nexora-chat-rg --query 'properties.latestRevisionName' -o tsv
az containerapp revision restart -n nexora-runner -g nexora-chat-rg --revision $rev
# 4. Revoke the old PAT in https://github.com/settings/personal-access-tokens
```

### Decommission

```powershell
# 1. Delete the Container App (this triggers the SIGTERM cleanup that
#    de-registers the runner from GitHub).
az containerapp delete -n nexora-runner -g nexora-chat-rg --yes

# 2. Remove the role assignments. The MI itself dies with the app, but the
#    role-assignment records linger and become "Unknown" entries unless
#    cleaned up. (List then delete by id.)
az role assignment list --assignee <runner-MI-objectId> -o tsv --query "[].id" | `
  ForEach-Object { az role assignment delete --ids $_ }

# 3. (Optional) Delete the PAT secret in KV and revoke it in GitHub.
az keyvault secret delete --vault-name nexora-chat-kv --name github-runner-pat
```

## Identity model

The runner Container App's managed identity is used *only* for:
- Pulling the image from ACR
- Reading the GH_PAT secret from Key Vault

The actual deploy workflow that runs *on* the runner authenticates to
Azure via OIDC, using the AAD app referenced by `vars.AZURE_CLIENT_ID`.
That principal already has the roles documented in
[RUNBOOK_CI_IAM.md](RUNBOOK_CI_IAM.md); nothing changes there.

## Security posture

- **Network**: no ingress; outbound to `github.com`, ARM, ACR, KV
  (private endpoint). Sits in the same VNet as the workload.
- **Secrets**: the PAT lives in Key Vault, never on disk in the
  container. Env-var mounting means it appears in the process
  environment but not in the image layer or in ACA's logged config.
- **Token TTL**: the runner *registration* token is minted fresh on
  every container start (1-hour TTL is fine, since we never reuse one).
  The PAT itself is what needs rotation; aim for 90-day or 1-year
  expiration with calendared rotation.
- **Image**: based on `ubuntu:22.04`; rebuild monthly to pick up CVE
  fixes. The image build runs server-side with `az acr build`.
- **Repo visibility**: this design assumes
  `Nexora-Lab-Co/nexora-platform` is *private*. Do not point a
  self-hosted runner at a public repo -- forks can submit PRs that
  execute on the runner.

## Troubleshooting

### Workflow stays queued ("waiting on runner to pick up this job")

The runner may be offline or labels don't match.

```powershell
# Is the container running?
az containerapp replica list -n nexora-runner -g nexora-chat-rg -o table

# What does the runner say about itself?
az containerapp logs show -n nexora-runner -g nexora-chat-rg --tail 200

# Does GitHub see it as online?
gh api repos/Nexora-Lab-Co/nexora-platform/actions/runners `
  --jq '.runners[] | {name, status, labels: [.labels[].name]}'
```

Common causes:
- PAT is missing or invalid -> container logs show "Failed to mint
  registration token"
- KV secret still has the placeholder `REPLACE_ME_WITH_REAL_PAT`
- Image pull failed -> `az containerapp revision list -n nexora-runner -g nexora-chat-rg` shows unhealthy revision; check for AcrPull role grant

### `ForbiddenByConnection` on Key Vault reads from the deploy job

The runner is hitting the public KV endpoint, which is blocked.
Confirm DNS in the container resolves to the private IP:

```powershell
az containerapp exec -n nexora-runner -g nexora-chat-rg --command "bash -lc 'getent hosts nexora-chat-kv.vault.azure.net'"
```

The address should fall inside `10.20.4.0/24` (pe-subnet in
nexora-dev-vnet). If it resolves to a public IP, the VNet link on the
`privatelink.vaultcore.azure.net` zone is broken -- inspect with:

```powershell
az network private-dns link vnet list -g rg-nexora-dev `
  --zone-name privatelink.vaultcore.azure.net -o table
```
