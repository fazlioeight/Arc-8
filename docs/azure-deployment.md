# Azure Deployment Runbook

This runbook deploys Nexora Lab with:

- React frontend on Azure Static Web Apps
- FastAPI backend on Azure Container Apps
- Azure Database for PostgreSQL Flexible Server
- Azure Managed Redis / Redis Enterprise for rate limiting and tenant cache
- Azure Blob Storage for customer-file landing zones and documents
- Azure Service Bus for durable ingestion jobs
- Azure Key Vault for production secrets
- Log Analytics for platform logs

The scripts are PowerShell and assume Azure CLI is installed and authenticated.

## 1. Prerequisites

```powershell
az login
az account set --subscription "<subscription-id>"
$env:AZURE_SUBSCRIPTION_ID = "<subscription-id>"
$env:NEXORA_POSTGRES_ADMIN_PASSWORD = "<strong-db-password>"
$env:NEXORA_INITIAL_ADMIN_PASSWORD = "<strong-initial-admin-password>"
$env:NEXORA_AZURE_TENANT_ID = "<entra-tenant-id>"
$env:NEXORA_AZURE_CLIENT_ID = "<app-registration-client-id>"
$env:NEXORA_AZURE_CLIENT_SECRET = "<app-registration-client-secret>"
```

Use a real GitHub repository URL for Static Web Apps. The script creates the
GitHub Actions workflow for the React build.

Create a Microsoft Entra ID app registration for Nexora Lab sign-in before
deploying the frontend:

- Add `https://<static-web-app-host>/login` as a redirect URI.
- For the backend exchange flow, use a Web redirect URI and create a client
  secret for the backend container app.
- Set the supported account type to the customer directory you want to allow.
- Make sure every Entra user that should sign in already has a matching active
  Nexora Lab user record for the tenant; the backend maps by email.

## 2. Provision Azure Foundation

From the repo root:

```powershell
.\infra\azure\00-provision-foundation.ps1 `
  -ResourceGroup "rg-nexora-prod" `
  -Location "eastus2" `
  -NamePrefix "nexora"
```

Copy the JSON output. You will need `acrName`, `containerAppEnvironment`,
`keyVaultName`, and `resourceGroup`.

What this creates:

- Resource group
- VNet and Container Apps subnet
- Azure Container Apps environment
- Azure Container Registry
- PostgreSQL Flexible Server with private network access and two databases:
  `nexora_control` and `nexora_tenant`
- Storage account with `raw-ingest`, `processed-ingest`, and `documents`
  containers
- Service Bus namespace and `customer-ingestion` queue
- Key Vault secrets for DB URLs, JWT secret, Redis URL, Storage, and Service Bus

## 3. Build and Deploy Backend

```powershell
.\infra\azure\01-deploy-backend-containerapp.ps1 `
  -ResourceGroup "rg-nexora-prod" `
  -AcrName "<acrName-from-step-2>" `
  -ContainerAppEnvironment "<containerAppEnvironment-from-step-2>" `
  -KeyVaultName "<keyVaultName-from-step-2>" `
  -BackendAppName "nexora-api" `
  -ImageTag "prod-001" `
  -TenantKey "prominencehealth" `
  -TenantName "ProminenceHealth" `
  -InitialAdminEmail "admin@prominencehealth.com"
```

This script:

- Builds `backend/Dockerfile` in Azure Container Registry.
- Creates or updates the backend Container App.
- Creates and starts a one-off Alembic migration job.
- Creates and starts a one-off initial tenant provisioning job.
- Prints the backend URL.

The tenant provision job only creates/updates the named tenant. It does not
delete existing tenants.

## 4. Deploy Frontend

```powershell
.\infra\azure\02-create-static-web-app.ps1 `
  -ResourceGroup "rg-nexora-prod" `
  -StaticWebAppName "nexora-portal" `
  -RepositoryUrl "https://github.com/<org>/<repo>" `
  -BackendApiBase "https://<backend-url-from-step-3>" `
  -Branch "main"
```

The frontend build reads:

```env
REACT_APP_API_BASE=https://<backend-url>
REACT_APP_DASHBOARD_SEED=false
```

The login page also reads Azure settings from the backend at runtime:

```env
AZURE_AUTH_ENABLED=true
AZURE_TENANT_ID=<entra-tenant-id>
AZURE_CLIENT_ID=<app-registration-client-id>
AZURE_CLIENT_SECRET=<app-registration-client-secret>
AZURE_AUTH_SCOPES="openid profile email"
```

For local frontend development you may also set `REACT_APP_AZURE_TENANT_ID`,
`REACT_APP_AZURE_CLIENT_ID`, and `REACT_APP_AZURE_REDIRECT_URI`, but production
should keep the client secret only on the backend.

After the Static Web App exists, redeploy the backend with CORS enabled:

```powershell
.\infra\azure\01-deploy-backend-containerapp.ps1 `
  -ResourceGroup "rg-nexora-prod" `
  -AcrName "<acrName>" `
  -ContainerAppEnvironment "<containerAppEnvironment>" `
  -KeyVaultName "<keyVaultName>" `
  -BackendAppName "nexora-api" `
  -ImageTag "prod-002" `
  -CorsOrigin "https://<static-web-app-host>"
```

## 5. Validate

```powershell
$api = "https://<backend-url>"
Invoke-RestMethod "$api/health/live"
Invoke-RestMethod "$api/health/ready"
```

Expected:

```json
{"status":"ok"}
{"status":"ready"}
```

## 6. Customer Ingestion Architecture

Use this flow for file and API ingestion:

```text
Customer source
  -> secure upload, FHIR API, SFTP bridge, or partner API
  -> Blob Storage raw-ingest container
  -> Event Grid or API message
  -> Service Bus customer-ingestion queue
  -> ingestion worker
  -> staging tables
  -> validation/reconciliation
  -> tenant PostgreSQL tables
  -> job status API/UI
```

Minimum ingestion work still needed in application code:

- Backend upload endpoints that stream files to `raw-ingest`.
- Service Bus worker that reads `customer-ingestion` messages.
- Staging tables for members, eligibility, providers, claims, MAO-004, charts,
  and FHIR resources.
- Idempotency keys per source file/resource/page.
- Validation reports with accepted/rejected row counts.
- FHIR pagination, retry/backoff, `_since` incremental sync, and resource
  mapping into tenant tables.
- Blob-backed document upload/download with malware scanning and retention.
- Job status API backed by durable job tables, not browser-side simulated
  progress.

## 7. Production Hardening Checklist

- Use Entra ID SSO for customer users instead of local password-only auth.
- Put PostgreSQL, Redis, Storage, Key Vault, and Service Bus behind private
  endpoints before handling production PHI.
- Replace local `AUDIT_LOG_PATH` file usage with database/Application Insights
  audit sinks for immutable retention.
- Add tenant-data Alembic migrations. Current Alembic migrations target the
  control plane; tenant tables are still created from SQLAlchemy metadata during
  provisioning.
- Move FHIR connector secrets to Key Vault references. The current connector
  model can store secret metadata, but real client secrets should not be stored
  as plain database values.
- Add CI checks: backend tests, frontend tests, Docker build, Alembic migration
  smoke test against PostgreSQL, and frontend build.

## References

- Azure Container Apps: https://learn.microsoft.com/azure/container-apps/overview
- Azure Static Web Apps: https://learn.microsoft.com/azure/static-web-apps/overview
- Azure Database for PostgreSQL Flexible Server: https://learn.microsoft.com/azure/postgresql/flexible-server/overview
- Azure Service Bus queues: https://learn.microsoft.com/azure/service-bus-messaging/service-bus-queues-topics-subscriptions
- Azure Blob Storage events: https://learn.microsoft.com/azure/storage/blobs/storage-blob-event-overview
- Azure Key Vault: https://learn.microsoft.com/azure/key-vault/general/overview
- Microsoft identity platform authorization code flow: https://learn.microsoft.com/entra/identity-platform/v2-oauth2-auth-code-flow
- Microsoft identity platform redirect URI setup: https://learn.microsoft.com/entra/identity-platform/how-to-add-redirect-uri
