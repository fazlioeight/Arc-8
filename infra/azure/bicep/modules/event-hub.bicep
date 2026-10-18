// Azure Event Hubs namespace + members topic + RAG consumer group.
//
// Sizing for the MVP:
//   * Standard SKU (Premium / Dedicated are for high-throughput)
//   * 1 throughput unit (1 TU = 1 MB/s in, 2 MB/s out)
//   * 7-day retention — same window as Cosmos continuous backup so snapshots
//     can be rebuilt from either source independently
//   * 4 partitions on the members topic — enough headroom for fan-out across
//     a handful of consumers; partitions can't be increased post-create on
//     Standard tier, so under-provisioning here means recreating the topic
//
// Identity & secrets:
//   * AAD-only access (no SAS keys distributed). Local-auth is disabled at the
//     namespace level.
//   * Public access disabled. The private endpoint module wires connectivity.

@description('Event Hubs namespace name (becomes <name>.servicebus.windows.net).')
param namespaceName string

param location string

param tags object = {}

@description('Members topic name. Suffixed .v1 — bump to .v2 on breaking schema changes.')
param membersTopicName string = 'nexora.member.changed.v1'

@description('Consumer group used by the RAG event processor.')
param ragConsumerGroupName string = 'rag-processor'

@description('Principal id (object id) of the identity that should be granted Sender+Receiver on this namespace.')
param containerAppPrincipalId string

resource namespace 'Microsoft.EventHub/namespaces@2024-05-01-preview' = {
  name: namespaceName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    isAutoInflateEnabled: true
    maximumThroughputUnits: 4
    disableLocalAuth: true
    publicNetworkAccess: 'Disabled'
    kafkaEnabled: false
    minimumTlsVersion: '1.2'
  }
}

resource membersTopic 'Microsoft.EventHub/namespaces/eventhubs@2024-05-01-preview' = {
  parent: namespace
  name: membersTopicName
  properties: {
    messageRetentionInDays: 7
    partitionCount: 4
    status: 'Active'
  }
}

resource ragConsumerGroup 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2024-05-01-preview' = {
  parent: membersTopic
  name: ragConsumerGroupName
  properties: {}
}

// Both roles on the same principal because the API container hosts the
// outbox publisher (sender) and the event processor will (week 1) run as
// a separate revision with the same MI for ops simplicity.
resource sender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: namespace
  name: guid(namespaceName, containerAppPrincipalId, 'eh-sender')
  properties: {
    // Azure Event Hubs Data Sender
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2b629674-e913-4c01-ae53-ef4638d8f975')
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}
resource receiver 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: namespace
  name: guid(namespaceName, containerAppPrincipalId, 'eh-receiver')
  properties: {
    // Azure Event Hubs Data Receiver
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde')
    principalId: containerAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output namespaceId string = namespace.id
output namespaceFqdn string = '${namespaceName}.servicebus.windows.net'
output membersTopic string = membersTopicName
output consumerGroupRag string = ragConsumerGroupName
