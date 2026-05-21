# Nexora Bicep — AI Semantic Layer

Bicep modules for the resources added by the RAG MVP (week 1 of the
[roadmap](../../../docs/architecture/roadmap.md)). These are **additive** to
the foundation provisioned by `infra/azure/00-provision-foundation.ps1`.

## Resources created

| Resource | Module | Public access | RBAC writer | RBAC reader |
|---|---|---|---|---|
| Cosmos DB account + database + 3 containers | `modules/cosmos.bicep` | Disabled | Cosmos DB Built-in Data Contributor | — |
| Azure AI Search service | `modules/ai-search.bicep` | Disabled | Search Index Data Contributor | — |
| Event Hubs namespace + members topic + rag consumer group | `modules/event-hub.bicep` | Disabled | Event Hubs Data Sender + Receiver | — |
| Azure OpenAI account + embedding deployment | `modules/azure-openai.bicep` | Disabled | Cognitive Services OpenAI User | — |
| 4 × private endpoint + DNS zone groups | `modules/private-endpoint.bicep` | n/a | n/a | n/a |
| 4 × private DNS zone + VNet link | inline in `main.bicep` | n/a | n/a | n/a |

## Prerequisites

These must already exist (created by `00-provision-foundation.ps1`):

1. **Resource group** — `rg-nexora-{env}`.
2. **VNet** with a dedicated private-endpoint subnet (`pe-subnet`, 10.20.4.0/24).
   The subnet must have `privateEndpointNetworkPolicies = Disabled`.
3. **Container App** with system-assigned managed identity. Capture its
   `principalId` for the `containerAppPrincipalId` parameter.

## Deploy

```bash
# Validate the template first — surfaces missing parameters or RBAC issues.
az deployment group validate \
  --resource-group rg-nexora-dev \
  --template-file main.bicep \
  --parameters @parameters/dev.json

# Preview changes.
az deployment group what-if \
  --resource-group rg-nexora-dev \
  --template-file main.bicep \
  --parameters @parameters/dev.json

# Apply.
az deployment group create \
  --resource-group rg-nexora-dev \
  --template-file main.bicep \
  --parameters @parameters/dev.json
```

## Wiring outputs into the Container App

The deployment outputs the FQDNs the application needs:

```bash
az deployment group show \
  --resource-group rg-nexora-dev \
  --name main \
  --query properties.outputs
```

Map them to Container App env vars (one-time, via `az containerapp update`
or in the deploy script):

| Bicep output | Container App env var | Setting |
|---|---|---|
| `cosmosEndpoint` | `AZURE_COSMOS_ENDPOINT` | `Settings.AZURE_COSMOS_ENDPOINT` |
| `cosmosDatabaseName` | `AZURE_COSMOS_DATABASE` | `Settings.AZURE_COSMOS_DATABASE` |
| `aiSearchEndpoint` | `AZURE_SEARCH_ENDPOINT` | `Settings.AZURE_SEARCH_ENDPOINT` |
| `aiSearchMembersIndex` | `AZURE_SEARCH_MEMBERS_INDEX` | `Settings.AZURE_SEARCH_MEMBERS_INDEX` |
| `eventHubNamespaceFqdn` | `AZURE_EVENT_HUB_NAMESPACE` | `Settings.AZURE_EVENT_HUB_NAMESPACE` |
| `eventHubMembersTopic` | `AZURE_EVENT_HUB_MEMBERS_TOPIC` | `Settings.AZURE_EVENT_HUB_MEMBERS_TOPIC` |
| `eventHubConsumerGroupRag` | `AZURE_EVENT_HUB_CONSUMER_GROUP_RAG` | `Settings.AZURE_EVENT_HUB_CONSUMER_GROUP_RAG` |
| `azureOpenAiEndpoint` | `AZURE_OPENAI_ENDPOINT` | `Settings.AZURE_OPENAI_ENDPOINT` |
| `azureOpenAiEmbeddingDeployment` | `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | `Settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT` |

No secrets are output — all data-plane access is via the Container App's
managed identity.

## Per-environment parameters

`parameters/dev.json` and `parameters/prod.json` carry the per-env values.
The `TODO_REPLACE_WITH_*` placeholders must be filled before the first
deploy — they are intentionally left empty so a fresh checkout doesn't
silently deploy against the wrong subscription.

## Drift detection

Re-run `what-if` on a schedule (CI job, weekly cron) and alert when the
output is non-empty — that's a portal change that didn't go through code.
