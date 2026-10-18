# Runbook — Member Portal Azure Separation (Option A: trust boundary first)

Splits the internet-facing **member portal** off the monolith into its own
hardened edge tier, **without** putting database credentials on any
internet-facing process. The shared Member360 data model is unchanged; the
internal/staff backend is untouched and keeps serving staff as before.

## Target architecture

```
Internet → Azure Front Door + WAF (member hostname)
              ├─ /*            → Member SPA  (Static Web App: frontend-member)   [no secrets]
              └─ /api/member/* → Member Edge Container App (nexora-member-portal) [NO DB creds, NO SECRET_KEY]
                                    └─(private, in-environment)→ backend (nexora-chat-v2) [DB creds stay here]
```

The edge (`edge/member-portal/`) is a path-allowlisted reverse proxy: it forwards
**only** `/api/member/*` to the backend's in-environment FQDN, holds no secrets,
and (when `EXPECTED_FRONT_DOOR_ID` is set) accepts traffic **only** from our
Front Door. All member auth/token validation and data access stay in the
backend, which is never the direct public path for member traffic.

## Artifacts in this change

| Artifact | Purpose |
|---|---|
| `edge/member-portal/{app.py,Dockerfile,requirements.txt,test_app.py}` | Edge reverse-proxy service + tests |
| `infra/azure/07-deploy-member-edge.ps1` | Build + deploy the edge Container App (asserts zero secrets) |
| `infra/azure/bicep/modules/front-door.bicep` | Front Door (Premium) + WAF, 2 routes (SPA, `/api/member/*`) |
| `infra/azure/08-create-member-static-web-app.ps1` | Member SPA Static Web App |
| `.github/workflows/deploy-member-edge.yml` | CI: test + deploy edge |
| `.github/workflows/deploy-member-portal-frontend.yml` | CI: build + deploy member SPA |

## Prerequisites (GitHub repo vars / secrets)

- Vars: `AZURE_ACR_NAME`, `AZURE_MEMBER_EDGE_URL` (set after step 2),
  `MEMBER_PORTAL_API_BASE` (the Front Door member host, set after step 4),
  `MEMBER_PORTAL_TENANT_KEY`, `MEMBER_PORTAL_BRAND_*`.
- Secrets: `AZURE_MEMBER_PORTAL_SWA_TOKEN`.
- Reuses existing `AZURE_CLIENT_ID/TENANT_ID/SUBSCRIPTION_ID/RESOURCE_GROUP` and the in-VNet self-hosted runner.

## Execution order (each step is reversible; no broad creds on the edge at any point)

1. **Flip member document storage to Azure Blob** — set `MEMBER360_STORAGE_BACKEND=azure`
   (+ `AZURE_STORAGE_ACCOUNT_NAME`) on the **backend** Container App and redeploy.
   Verify a Feature 4 EOB/plan-doc download still works. *(Removes the local-FS
   dependency so documents work across instances/tiers. No new exposure — this
   is a backend env change; confirm before running since it's staff-shared.)*

2. **Deploy the edge Container App** (not yet public-fronted):
   `./infra/azure/07-deploy-member-edge.ps1 -ResourceGroup <rg> -AcrName <acr>`
   The script refuses to proceed if the app has any secret configured. Smoke:
   `curl https://<edge-fqdn>/health/live` → 200; a `/api/member/...` call proxies
   through to the backend. Set repo var `AZURE_MEMBER_EDGE_URL=https://<edge-fqdn>`.

3. **Deploy the member SPA** Static Web App:
   `./infra/azure/08-create-member-static-web-app.ps1 -ResourceGroup <rg> -RepositoryUrl <url> -MemberApiBase <placeholder-or-fd-host>`

4. **Provision Front Door + WAF** and wire both routes:
   `az deployment group create -g <rg> -f infra/azure/bicep/modules/front-door.bicep -p namePrefix=nexora spaHostName=<swa-host> edgeHostName=<edge-fqdn>`
   Capture the `frontDoorId` output → set `EXPECTED_FRONT_DOOR_ID` on the edge app
   (rerun step 2 with it) so the edge rejects non-Front-Door traffic. Set
   `MEMBER_PORTAL_API_BASE` to the Front Door endpoint host and rebuild the SPA.
   Validate end-to-end through the WAF: register → verify → login+MFA → dashboard
   → EOB download → provider search.

5. **Cut the member custom domain** to the Front Door endpoint. Staff app and its
   domain are untouched.

## Fast-follow hardening — IMPLEMENTED (still Option A → on-ramp to Option B)

### A. Lock the backend's public `/api/member/*` to the edge

`MemberEdgeGuardMiddleware` rejects (404) any `/api/member/*` request lacking the
`X-Edge-Auth` shared secret, which **only the edge injects**. It is **dormant**
until `MEMBER_EDGE_SHARED_SECRET` is set on the backend. Rollout (no member
downtime):

1. Deploy backend normally — secret is provisioned to Key Vault
   (`member-edge-shared-secret`) but **not** injected into the backend, so the
   guard stays dormant.
2. Deploy/redeploy the edge: `07-deploy-member-edge.ps1` fetches the secret from
   Key Vault and the edge starts sending `X-Edge-Auth` (harmless while dormant).
3. Flip enforcement on: redeploy the backend with `-EnableMemberEdgeGuard`. Now
   member routes 404 unless they arrive through the edge. Verify member flows via
   Front Door still work, and that a direct hit to the backend FQDN
   `/api/member/auth/me` returns 404.
4. Optionally also set `EXPECTED_FRONT_DOOR_ID` on the edge (pass `-FrontDoorId`
   to `07-...`) so the edge itself only accepts traffic from our Front Door.

Rollback: redeploy the backend without `-EnableMemberEdgeGuard`.

### B. Separate member JWT signing key — DONE (safe to enable immediately)

The member realm signs/verifies with `MEMBER_JWT_SECRET_KEY` (falls back to
`SECRET_KEY` when unset). `deploy-to-azure.ps1` provisions `platform-member-jwt-key`
and injects it on every backend deploy. Enabling it (or rotating it) invalidates
only in-flight member access tokens (≤15 min); the SPA silently re-mints via its
opaque refresh token. Staff tokens are unaffected. The internet-facing edge holds
no signing key either way.

### C. Least-privilege data path (Option B, not yet done)

Introduce the internal data API / private endpoints so even the backend's member
surface uses a scoped DB role.

## Rollback

- Step 4/5: disable the Front Door route or repoint member DNS to the prior host.
- Steps 2–3: edge + SWA are additive — delete with zero impact on backend/staff.
- Step 1: revert `MEMBER360_STORAGE_BACKEND` env and redeploy backend.

## Invariants (must always hold)

- The edge tier has **no** `*_DATABASE_URL`, `SECRET_KEY`, or `FIELD_ENCRYPTION_KEY`.
  Its only permitted secret is the narrow `member-edge-shared-secret` (the
  edge→backend authorizer). `07-deploy-member-edge.ps1` deny-lists any DB/signing
  secret and aborts if one ever appears.
- No PHI / member identifiers leave to third parties (provider-search privacy
  rule carries forward; the edge only forwards first-party traffic).
- The staff/internal app is never modified destructively.
