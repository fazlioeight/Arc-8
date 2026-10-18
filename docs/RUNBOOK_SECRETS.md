# Secret rotation runbook

Last reviewed: 2026-05-16

All long-lived secrets for the platform live in the resource-group Key Vault
(`nexora-chat-kv` by default) and are surfaced to the Container App as
`secretref:` env vars. This runbook covers the rotation procedure for each.

The general rotation principle is **canary + drain**:

1. Add the new secret value to Key Vault under a fresh secret name.
2. Issue a Container App update that publishes BOTH the old and the new
   secretref values via a new revision suffix.
3. Wait for the new revision to be Healthy.
4. Flip traffic to the new revision.
5. Once you have confirmed the new revision is happily running on the new
   secret, deactivate the old revision and remove the old secret from
   Key Vault.

Steps 2-4 are already automated by `deploy-to-azure.ps1` Phase 4; you just
need to bump the secret value beforehand.

---

## SECRET_KEY (JWT signing key)

**Blast radius:** every active session. After rotation, all existing JWTs
become invalid and users must re-login.

```powershell
$rg = "nexora-chat-rg"; $kv = "nexora-chat-kv"; $app = "nexora-chat"

# 1. Generate and store a new 48-byte key.
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$new = [Convert]::ToBase64String($bytes)
az keyvault secret set --vault-name $kv --name "platform-secret-key" --value $new --output none

# 2. Trigger a redeploy. The deploy script reads the new value and pushes
#    a new revision with health-gated traffic flip.
pwsh ./deploy-to-azure.ps1 -SkipMigrations -SkipFrontend
```

There is **no graceful "accept old AND new" mode** for HS256 JWTs in this
codebase. Rotation cuts all sessions; communicate the brief signout window
to users before rotating.

---

## FIELD_ENCRYPTION_KEY (Fernet, at-rest field encryption)

**Blast radius:** anything encrypted with `EncryptedString` columns —
currently just `fhir_connectors.client_secret`.

This one supports graceful rotation because the application accepts
**comma-separated** keys (`MultiFernet`): writers use the first key, readers
try every key. Follow this order:

```powershell
$rg = "nexora-chat-rg"; $kv = "nexora-chat-kv"; $app = "nexora-chat"

# 1. Generate the new key.
$fkBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($fkBytes)
$new = ([Convert]::ToBase64String($fkBytes)) -replace '\+', '-' -replace '/', '_'

# 2. Read the current key, prepend the new one so it becomes the writer.
$current = az keyvault secret show --vault-name $kv --name "platform-field-encryption-key" --query value -o tsv
$combined = "$new,$current"
az keyvault secret set --vault-name $kv --name "platform-field-encryption-key" --value $combined --output none

# 3. Redeploy. New writes encrypt with the new key; old rows still decrypt.
pwsh ./deploy-to-azure.ps1 -SkipMigrations -SkipFrontend

# 4. (Re-key existing rows.) Run a re-encrypt pass: read every
#    EncryptedString-bearing row through the ORM and rewrite it. The simplest
#    approach is a one-shot script that selects + saves every FhirConnector.
#    Until that script exists, you may live with mixed-key state — readers
#    still work.

# 5. Once all rows are re-encrypted, drop the old key from the comma list and
#    redeploy again so the old key is no longer in memory.
az keyvault secret set --vault-name $kv --name "platform-field-encryption-key" --value $new --output none
pwsh ./deploy-to-azure.ps1 -SkipMigrations -SkipFrontend
```

If you skip step 4, the old key must remain in the comma list forever, and
that defeats most of the point of rotation. Plan the re-encrypt pass for any
rotation event.

---

## Postgres admin password

**Blast radius:** every backend container will fail to connect to Postgres
until the env var refreshes. Has to be done in a maintenance window.

```powershell
$rg = "nexora-chat-rg"; $kv = "nexora-chat-kv"
$server = "nexora-chat-pg"; $user = "<admin-user>"

# 1. Generate a new password.
$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$new = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''
$new = $new.Substring(0, 24)

# 2. Set it on the server first (atomic — connections in flight may be torn
#    down depending on the Postgres version, hence the maintenance window).
az postgres flexible-server update --name $server -g $rg --admin-password $new --output none

# 3. Update Key Vault.
az keyvault secret set --vault-name $kv --name "postgres-admin-password" --value $new --output none

# 4. Redeploy so the new DSNs are picked up.
pwsh ./deploy-to-azure.ps1 -SkipMigrations -SkipFrontend
```

For zero-downtime password rotation you need a dedicated rotation user that
the application connects as, plus a separate admin user used only for DDL.
Setting that up is out of scope for this runbook.

---

## ANTHROPIC_API_KEY

**Blast radius:** the chat feature is offline until the env var refreshes.
Already wired as a Key Vault reference (`keyvaultref:...`), so the rotation
is simply:

```powershell
$kv = "nexora-chat-kv"

# 1. Get a fresh key from the Anthropic console.
az keyvault secret set --vault-name $kv --name "anthropic-api-key" --value "<new-key>" --output none

# 2. The Container App reads via secretref so it picks up the new value on
#    its next replica restart. To force an immediate refresh:
az containerapp revision restart -n nexora-chat -g nexora-chat-rg --revision $(az containerapp show -n nexora-chat -g nexora-chat-rg --query "properties.latestRevisionName" -o tsv)
```

---

## Initial admin password

This is intended to be used ONCE then immediately rotated by the operator on
first login. If it has somehow leaked into a chat transcript or log, treat
that account as compromised: rotate via the password-reset flow (see
`/api/auth/password-reset/request`) and audit all `login.success` events
for that email in `tenant_audit_events`.

---

## What to never rotate without a coordinated plan

- **`JWT_ALGORITHM`** — the verifier accepts exactly one algorithm. Changing
  it cuts all sessions AND invalidates any other system that issued a JWT
  for us. Currently locked to HS256.
- **`MFA_ISSUER`** — only cosmetic in the authenticator app, but changing it
  causes the QR codes to render the entry as a new account. Plan an
  announcement; users will see "Nexora Lab (old)" and "Nexora Lab (new)" in
  their authenticator until they delete the old one.
