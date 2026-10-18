// Nexora — AI semantic layer (RAG MVP) Bicep orchestrator.
//
// Provisions the additive resources that the existing PowerShell foundation
// script (00-provision-foundation.ps1) does NOT create:
//
//   * Azure Cosmos DB account + database + containers
//   * Azure AI Search service
//   * Azure Event Hubs namespace + topic + consumer group
//   * Azure OpenAI account + embedding deployment
//   * Private endpoints for each of the above
//   * Private DNS zones (one per service) linked to the existing VNet
//   * Role assignments to the Container App's managed identity
//
// Networking:
//   * All four PaaS services have public network access disabled.
//   * Each service gets a private endpoint into the existing
//     `pe-subnet` (10.20.4.0/24 — caller must have created this in the
//     foundation script before deploying this module).
//   * DNS resolution is via private DNS zones linked to the foundation
//     VNet so the Container App can call `*.openai.azure.com` etc.
//     and get private IPs back.
//
// Identity:
//   * No secrets are output. Everything binds to the Container App's
//     system-assigned managed identity (passed in as
//     `containerAppPrincipalId`), and all data-plane access is via
//     RBAC, not connection strings or keys.
//
// Usage (CI deploy):
//   az deployment group create \
//     --resource-group rg-nexora-prod \
//     --template-file infra/azure/bicep/main.bicep \
//     --parameters @infra/azure/bicep/parameters/prod.json
//
// Validate before applying:
//   az deployment group what-if -g rg-nexora-prod -f main.bicep -p @prod.json

targetScope = 'resourceGroup'

// ── Parameters ──────────────────────────────────────────────────────────────

@description('Naming prefix, e.g. "nexora-prod". Service-specific suffixes are appended.')
param namePrefix string

@description('Azure region. Must support all four services (Cosmos, AI Search, Event Hub, Azure OpenAI). eastus and westus3 are both safe.')
param location string = resourceGroup().location

@description('Resource ID of the existing VNet provisioned by the foundation script.')
param vnetId string

@description('Resource ID of the private-endpoint subnet inside the foundation VNet.')
param privateEndpointSubnetId string

@description('Principal ID (object id) of the Container App\'s system-assigned managed identity. Used for RBAC role assignments.')
param containerAppPrincipalId string

@description('Tags to apply to all created resources.')
param tags object = {
  'app': 'nexora'
  'managed-by': 'bicep'
  'compliance': 'hipaa'
}

@description('Azure OpenAI embedding deployment capacity (TPM in thousands). Defaults to 250 = 250k TPM.')
param openAiEmbeddingCapacity int = 250

// ── Modules ─────────────────────────────────────────────────────────────────

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos-${namePrefix}'
  params: {
    accountName: '${namePrefix}-cosmos'
    location: location
    tags: tags
    containerAppPrincipalId: containerAppPrincipalId
  }
}

module aiSearch 'modules/ai-search.bicep' = {
  name: 'ai-search-${namePrefix}'
  params: {
    name: '${namePrefix}-search'
    location: location
    tags: tags
    containerAppPrincipalId: containerAppPrincipalId
  }
}

module eventHub 'modules/event-hub.bicep' = {
  name: 'event-hub-${namePrefix}'
  params: {
    namespaceName: '${namePrefix}-eh'
    location: location
    tags: tags
    containerAppPrincipalId: containerAppPrincipalId
  }
}

module azureOpenAi 'modules/azure-openai.bicep' = {
  name: 'aoai-${namePrefix}'
  params: {
    accountName: '${namePrefix}-oai'
    location: location
    embeddingCapacity: openAiEmbeddingCapacity
    tags: tags
    containerAppPrincipalId: containerAppPrincipalId
  }
}

// ── Private DNS zones (one per service) ─────────────────────────────────────

var privateDnsZones = [
  'privatelink.documents.azure.com'    // Cosmos
  'privatelink.search.windows.net'     // AI Search
  'privatelink.servicebus.windows.net' // Event Hub
  'privatelink.openai.azure.com'       // Azure OpenAI
]

resource dnsZones 'Microsoft.Network/privateDnsZones@2024-06-01' = [for zoneName in privateDnsZones: {
  name: zoneName
  location: 'global'
  tags: tags
}]

resource dnsZoneLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [for (zoneName, i) in privateDnsZones: {
  parent: dnsZones[i]
  name: '${namePrefix}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnetId
    }
  }
}]

// ── Private endpoints ───────────────────────────────────────────────────────

module pe_cosmos 'modules/private-endpoint.bicep' = {
  name: 'pe-cosmos-${namePrefix}'
  params: {
    name: '${namePrefix}-cosmos-pe'
    location: location
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: cosmos.outputs.accountId
    groupIds: [ 'Sql' ]
    privateDnsZoneId: dnsZones[0].id
    tags: tags
  }
}

module pe_aiSearch 'modules/private-endpoint.bicep' = {
  name: 'pe-aisearch-${namePrefix}'
  params: {
    name: '${namePrefix}-search-pe'
    location: location
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: aiSearch.outputs.serviceId
    groupIds: [ 'searchService' ]
    privateDnsZoneId: dnsZones[1].id
    tags: tags
  }
}

module pe_eventHub 'modules/private-endpoint.bicep' = {
  name: 'pe-eh-${namePrefix}'
  params: {
    name: '${namePrefix}-eh-pe'
    location: location
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: eventHub.outputs.namespaceId
    groupIds: [ 'namespace' ]
    privateDnsZoneId: dnsZones[2].id
    tags: tags
  }
}

module pe_openai 'modules/private-endpoint.bicep' = {
  name: 'pe-aoai-${namePrefix}'
  params: {
    name: '${namePrefix}-oai-pe'
    location: location
    subnetId: privateEndpointSubnetId
    privateLinkServiceId: azureOpenAi.outputs.accountId
    groupIds: [ 'account' ]
    privateDnsZoneId: dnsZones[3].id
    tags: tags
  }
}

// ── Role assignments ────────────────────────────────────────────────────────
// Role assignments live INSIDE each module (cosmos.bicep, ai-search.bicep,
// event-hub.bicep, azure-openai.bicep) because Bicep BCP120 requires the
// role assignment name to be calculable at start-of-deploy, which a
// module's `outputs.X` is not. Each module receives ``containerAppPrincipalId``
// and creates the data-plane role scoped to its own resource.

// ── Outputs ─────────────────────────────────────────────────────────────────
// Outputs are injected into the Container App as env vars by the deploy
// script. None of them carry secrets.

output cosmosEndpoint string = cosmos.outputs.endpoint
output cosmosDatabaseName string = cosmos.outputs.databaseName
output aiSearchEndpoint string = aiSearch.outputs.endpoint
output aiSearchMembersIndex string = 'idx-members-v1' // logical name, see app/services/ai/search.py
output eventHubNamespaceFqdn string = eventHub.outputs.namespaceFqdn
output eventHubMembersTopic string = eventHub.outputs.membersTopic
output eventHubConsumerGroupRag string = eventHub.outputs.consumerGroupRag
output azureOpenAiEndpoint string = azureOpenAi.outputs.endpoint
output azureOpenAiEmbeddingDeployment string = azureOpenAi.outputs.embeddingDeploymentName
