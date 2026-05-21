// Reusable private endpoint + DNS zone group.
//
// One private endpoint per PaaS service. The `groupIds` parameter tells
// Azure which sub-resource to expose; the values are service-specific
// constants documented at
// https://learn.microsoft.com/azure/private-link/private-endpoint-overview#private-link-resource
//
//   Cosmos SQL API   → "Sql"
//   AI Search        → "searchService"
//   Event Hubs       → "namespace"
//   Azure OpenAI     → "account"
//   Key Vault        → "vault"
//   Storage blob     → "blob"

@description('Private endpoint name.')
param name string

@description('Region. Must match the target resource\'s region.')
param location string

@description('Subnet resource id where the PE NIC will be placed.')
param subnetId string

@description('Resource id of the PaaS service the PE fronts.')
param privateLinkServiceId string

@description('Sub-resource group ids — service-specific. See module header.')
param groupIds array

@description('Private DNS zone resource id whose A records will be auto-populated for this PE.')
param privateDnsZoneId string

param tags object = {}

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    subnet: {
      id: subnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${name}-conn'
        properties: {
          privateLinkServiceId: privateLinkServiceId
          groupIds: groupIds
        }
      }
    ]
  }
}

// Wire DNS so callers inside the VNet resolve the FQDN to the PE's private IP.
// Without this, the application still has to use the public FQDN, which won't
// resolve at all (public network access is disabled on the target service)
// and the call fails with a name-resolution error.
resource dnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: privateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'config'
        properties: {
          privateDnsZoneId: privateDnsZoneId
        }
      }
    ]
  }
}

output privateEndpointId string = privateEndpoint.id
