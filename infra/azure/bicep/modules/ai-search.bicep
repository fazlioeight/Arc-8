// Azure AI Search service.
//
// SKU "standard" (S1) gives us:
//   - Replicas/partitions adjustable up to 12 each
//   - 25 GB index storage included
//   - Semantic ranker available
//
// We start at 1 replica × 1 partition for the MVP. Scale-up is a portal /
// `az search service update` operation that requires no re-indexing.
//
// Auth: AAD-only (apiKeysOnly=false + disableLocalAuth=true). The control
// plane only respects RBAC; the data plane only respects RBAC. Index
// definitions are pushed by the application's startup hook
// (AzureSearchClient.ensure_member_index).

@description('Search service name. Must be globally unique, 2-60 chars, lowercase, [a-z0-9-].')
param name string

@description('Region. Pick one that supports semantic search.')
param location string

param tags object = {}

@description('Principal id (object id) of the identity that should get Search Index Data Contributor on this service.')
param containerAppPrincipalId string

resource search 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'standard'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'disabled'
    // Force AAD-only access. With this, the keys-based API path returns 401.
    disableLocalAuth: true
    authOptions: null
    semanticSearch: 'standard'
  }
}

// 'Search Index Data Contributor' = read+write on index docs only.
// 'Search Service Contributor' (broader) is intentionally NOT granted —
// schema changes flow through Bicep, not the runtime principal.
resource indexDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: search
  name: guid(name, containerAppPrincipalId, 'search-data-contrib')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8ebe5a00-799e-43f5-93ac-243d3dce84a7')
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output serviceId string = search.id
output endpoint string = 'https://${name}.search.windows.net'
