// Cosmos DB SQL API account for the AI semantic layer.
//
// Containers created here are the ones the RAG MVP consumes today; future
// containers (feature_store, rag_chunks) can be added without touching the
// account.
//
// Pricing model: capacity mode "Serverless" — pay-per-request. Right call for
// the MVP where total RU/s is small and bursty (embedding worker writes one
// snapshot per member event). Switch to provisioned + autoscale once
// steady-state RU/s exceeds ~400.

@description('Cosmos account name. Must be globally unique, 3-44 chars, lowercase, [a-z0-9-].')
param accountName string

@description('Region. Cosmos SQL is available in every Azure public region.')
param location string

@description('Tags applied to the account and child resources.')
param tags object = {}

@description('Principal id (object id) of the identity that should get data-plane read+write on this Cosmos account.')
param containerAppPrincipalId string

// Cosmos account.
//
// `disableLocalAuth=true` forbids primary/secondary key access — every caller
// must authenticate via AAD. This is what makes RBAC the only path to data.
resource account 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    databaseAccountOfferType: 'Standard'
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      // Session is the right default for OLTP-shaped workloads; we don't
      // need strong consistency for snapshots that are eventually rebuilt
      // from Event Hub anyway.
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    backupPolicy: {
      // Continuous backup keeps the last 30 days, point-in-time restorable
      // — required by HIPAA contingency planning §164.308(a)(7)(ii)(A).
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous30Days'
      }
    }
  }
}

// SQL database (logical grouping of containers).
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: account
  name: 'nexora'
  properties: {
    resource: {
      id: 'nexora'
    }
  }
}

// event_snapshots: durable replay log of every domain event. Partitioned by
// /tenant_id so a single-tenant query never crosses partitions. TTL is
// disabled — snapshots are forensic evidence.
resource snapshots 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'event_snapshots'
  properties: {
    resource: {
      id: 'event_snapshots'
      partitionKey: {
        paths: [ '/tenant_id' ]
        kind: 'Hash'
      }
      defaultTtl: -1
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          // The full payload can be large; we don't need it indexed.
          { path: '/payload/*' }
        ]
      }
    }
  }
}

// semantic_member: denormalized current state. Partitioned by /tenant_id.
resource semanticMember 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'semantic_member'
  properties: {
    resource: {
      id: 'semantic_member'
      partitionKey: {
        paths: [ '/tenant_id' ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        includedPaths: [
          { path: '/*' }
        ]
      }
    }
  }
}

// rag_chunks: future container for chunked source text. Created now so the
// embedding worker can be enabled to write here without a Bicep change.
resource ragChunks 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'rag_chunks'
  properties: {
    resource: {
      id: 'rag_chunks'
      partitionKey: {
        paths: [ '/tenant_id' ]
        kind: 'Hash'
      }
    }
  }
}

// Data-plane RBAC: Cosmos's "Built-in Data Contributor" role allows read+write
// at the container level. The name must be deterministic at start-of-deploy
// (Bicep BCP120) so we derive it from the account name + principal id, which
// are known parameters.
resource dataContributor 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: account
  name: guid(accountName, containerAppPrincipalId, 'data-contributor')
  properties: {
    // 00000000-0000-0000-0000-000000000002 = Cosmos DB Built-in Data Contributor
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: containerAppPrincipalId
    scope: account.id
  }
}

output accountId string = account.id
output endpoint string = account.properties.documentEndpoint
output databaseName string = database.name
