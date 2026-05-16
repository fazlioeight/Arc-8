# CI service principal: required Azure role grants

Last reviewed: 2026-05-16

The `deploy-backend.yml` workflow logs in via federated OIDC and then runs
`deploy-to-azure.ps1`. The script does far more than a one-line image swap,
so the service principal it logs in as needs more permissions than the
previous workflow assumed. This document lists the minimum role grants.

The OIDC service principal is identified in GitHub by:

- `vars.AZURE_CLIENT_ID`
- `vars.AZURE_TENANT_ID`
- `vars.AZURE_SUBSCRIPTION_ID`

Below, `$SP` is the principal id of that service principal, `$RG` is the
target resource group, `$KV` is the Key Vault name, and `$ACR` is the
Container Registry name.

## Minimum role grants

For a stable production environment where the initial bootstrap is already
done, two grants are sufficient. Everything else flows from these.

```bash
# 1. Contributor on the resource group.
#    Covers Container Apps (update, revision flip, ingress, jobs), Postgres
#    flexible server db ops, App Insights reads, ACR Build invocation.
az role assignment create \
  --assignee "$SP" \
  --role "Contributor" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG"

# 2. Key Vault Secrets Officer on the Key Vault.
#    Lets CI READ existing platform-* secrets (-StrictSecrets prevents
#    silent regeneration) and WRITE the rotated DSN secrets every deploy
#    (platform-control-db-url, platform-tenant-db-url, *-sync, *-psycopg).
az role assignment create \
  --assignee "$SP" \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/$SUB/resourceGroups/$RG/providers/Microsoft.KeyVault/vaults/$KV"
```

## What each piece of the script needs

If you prefer least-privilege over the simple Contributor grant, here is
the call-by-call breakdown:

| Script action                                              | Role required                                          | Scope                                       |
|------------------------------------------------------------|--------------------------------------------------------|---------------------------------------------|
| `az keyvault secret show platform-*`                       | Key Vault Secrets User                                 | the Key Vault                               |
| `az keyvault secret set platform-control-db-url` (etc.)    | Key Vault Secrets Officer                              | the Key Vault                               |
| `az containerapp show / update / ingress / revision / job` | Container Apps Contributor                             | the container app + the container app env   |
| `az containerapp identity assign`                          | Container Apps Contributor                             | the container app                           |
| `az role assignment create` (MI ↔ KV)                      | Role Based Access Control Administrator                | the Key Vault                               |
| `az postgres flexible-server db create`                    | Contributor on the Postgres server                     | the Postgres flexible server                |
| `az acr build`                                             | AcrPush + AcrPull                                      | the registry                                |
| `az monitor app-insights component show`                   | Reader                                                 | the App Insights resource                   |

## The one-time bootstrap exception

The very first deploy ever ran needs to grant the container app's
managed identity Key Vault Secrets User on the KV — that's the
`az role assignment create` call inside the script's Phase 4. Doing this
from CI requires the deploying principal to have **Role Based Access
Control Administrator** on the KV. After the first run, the role
assignment already exists; the script's create call is idempotent
("already exists" exit code) and the RBAC Admin grant can be removed
from CI.

Because RBAC Admin is sensitive, the recommended pattern is:

1. **First-time bootstrap** runs from an operator workstation (where the
   admin has full rights), not from CI.
2. **Ongoing CI deploys** only need Contributor + Secrets Officer; the
   MI role assignment is already in place.

## How to grant from PowerShell

```powershell
$sub = "<subscription id>"
$rg  = "nexora-chat-rg"
$kv  = "nexora-chat-kv"
$spId = "<service principal object id>"   # NOT the app id; the SP's objectId

az role assignment create `
  --assignee $spId `
  --role "Contributor" `
  --scope "/subscriptions/$sub/resourceGroups/$rg"

az role assignment create `
  --assignee $spId `
  --role "Key Vault Secrets Officer" `
  --scope "/subscriptions/$sub/resourceGroups/$rg/providers/Microsoft.KeyVault/vaults/$kv"
```

## Verifying

After granting, push a no-op commit that touches `backend/**` to trigger
`deploy-backend.yml`. Watch for these failure modes in the logs:

- `(AuthorizationFailed) ... does not have authorization` → role missing.
  The message names the specific operation, e.g.
  `Microsoft.KeyVault/vaults/secrets/write` → grant Secrets Officer.
- `Key Vault secret 'platform-secret-key' is missing` →
  bootstrap was never run; run the script locally once without
  `-StrictSecrets` to seed the secrets.
- `ACR build did not push ...` → AcrPush missing on the registry, or the
  registry name in the script doesn't match the actual one.
