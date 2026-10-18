// Azure OpenAI account with the embedding deployment used by the RAG MVP.
//
// Why a dedicated account (not piggy-backing on a shared one)?
//
//   * Per-tenant cost attribution — each Nexora deployment gets its own
//     metering surface.
//   * BAA scoping — Microsoft's BAA covers Azure OpenAI calls but the
//     auditable scope is per resource. A dedicated account makes the
//     compliance bundle simpler.
//   * Capacity isolation — the embedding worker can be rate-limited
//     independently of any future chat / completion deployment.
//
// We only declare the embedding deployment here. Chat continues to go via
// Anthropic per architecture decision 2026-05-19. If we ever migrate chat
// to Azure OpenAI, add a second deployment here (e.g. `gpt-4o`).

@description('Azure OpenAI account name. 2-64 chars, lowercase.')
param accountName string

param location string

@description('Embedding deployment capacity in thousands of TPM. 250 = 250,000 TPM.')
param embeddingCapacity int = 250

@description('Embedding model name as published by Azure OpenAI.')
param embeddingModelName string = 'text-embedding-3-large'

@description('Model version. Pin to a specific version — auto-upgrade breaks vector recall comparisons.')
param embeddingModelVersion string = '1'

@description('Logical deployment name the application uses. The SDK calls this — keep it stable across upgrades.')
param embeddingDeploymentName string = 'text-embedding-3-large'

param tags object = {}

@description('Principal id (object id) of the identity that should be granted Cognitive Services OpenAI User on this account.')
param containerAppPrincipalId string

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: accountName
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    networkAcls: {
      defaultAction: 'Deny'
      virtualNetworkRules: []
      ipRules: []
    }
  }
}

resource embedding 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: account
  name: embeddingDeploymentName
  sku: {
    // "Standard" = pay-per-token. "ProvisionedManaged" is the reserved-
    // capacity option; revisit when steady-state TPM > 1M.
    name: 'Standard'
    capacity: embeddingCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
    raiPolicyName: 'Microsoft.DefaultV2'
  }
}

// 'Cognitive Services OpenAI User' = data-plane calls (embeddings, completions).
// Does NOT include deployment management — that stays a Bicep operation.
resource user 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: account
  name: guid(accountName, containerAppPrincipalId, 'aoai-user')
  properties: {
    // 5e0bd9bd-7b93-4f28-af87-19fc36ad61bd = Cognitive Services OpenAI User
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output accountId string = account.id
output endpoint string = account.properties.endpoint
output embeddingDeploymentName string = embeddingDeploymentName
