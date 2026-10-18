// Minimal bootstrap for the RAG MVP environment.
//
// Creates the prerequisites the main.bicep template depends on:
//
//   * VNet 10.20.0.0/16 with four subnets:
//       - aca-subnet      (10.20.0.0/23) — Container Apps Environment
//       - postgres-subnet (10.20.2.0/24) — future Flexible Server delegation
//       - default         (10.20.3.0/24) — anything that doesn't need delegation
//       - pe-subnet       (10.20.4.0/24) — private endpoints, NetworkPolicies disabled
//
//   * Log Analytics workspace — cheapest SKU, required by Container Apps Env.
//
//   * Container Apps Environment, VNet-integrated on aca-subnet.
//
//   * Placeholder Container App running mcr.microsoft.com/azuredocs/containerapps-helloworld
//     so we can hand its system-assigned managed identity to the RAG Bicep
//     for role assignments. Min replicas = 0 keeps idle cost at zero.
//
// Idle cost: roughly $0/month (Log Analytics free tier covers 5 GB/month;
// Container Apps Env doesn't bill when no workload is running).
//
// Run once per environment:
//   az deployment group create \
//     -g rg-nexora-dev \
//     -f bootstrap.bicep \
//     -p namePrefix=nexora-dev

targetScope = 'resourceGroup'

@description('Naming prefix, e.g. "nexora-dev". Service-specific suffixes are appended.')
param namePrefix string = 'nexora-dev'

@description('Region. Must support Container Apps + Azure OpenAI (westus3 or eastus).')
param location string = resourceGroup().location

@description('Tags applied to every resource.')
param tags object = {
  app: 'nexora'
  'managed-by': 'bicep'
  environment: 'dev'
  purpose: 'rag-mvp-bootstrap'
}

// ── Networking ──────────────────────────────────────────────────────────────

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${namePrefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [ '10.20.0.0/16' ]
    }
    subnets: [
      {
        name: 'aca-subnet'
        properties: {
          addressPrefix: '10.20.0.0/23'
          // Container Apps Environment requires the subnet to be delegated
          // to Microsoft.App/environments before the env can attach via
          // infrastructureSubnetId. Without this we get
          // ManagedEnvironmentSubnetDelegationError on deploy.
          delegations: [
            {
              name: 'aca-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'postgres-subnet'
        properties: {
          addressPrefix: '10.20.2.0/24'
          // Delegate so future Postgres Flexible Server can use it.
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'default'
        properties: {
          addressPrefix: '10.20.3.0/24'
        }
      }
      {
        name: 'pe-subnet'
        properties: {
          addressPrefix: '10.20.4.0/24'
          // Required for Private Endpoint NICs — without this, PE creation
          // fails with "PrivateEndpointNetworkPoliciesEnabled".
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

// Convenience references so module outputs are unambiguous.
resource acaSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'aca-subnet'
}
resource peSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'pe-subnet'
}

// ── Log Analytics ──────────────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    // 30-day retention is the floor on PerGB2018 and is plenty for a
    // bootstrap. Bump to 90+ in prod for HIPAA audit trail purposes.
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ── Container Apps Environment ─────────────────────────────────────────────

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-acaenv'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: acaSubnet.id
      // External ingress for now — Front Door + WAF lands in Week 3 per
      // the roadmap. For the bootstrap, an external endpoint just makes
      // smoke-testing easier.
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// ── Placeholder Container App ──────────────────────────────────────────────
// Hello-world image so we can capture a system-assigned MI principalId for
// the RAG Bicep's role assignments. min=0 means it costs nothing at idle.

resource placeholderApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'placeholder'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        // Scale to zero so the bootstrap doesn't bill while we work on the
        // RAG layer. Min=0 means a cold start on first request, which is
        // fine for a placeholder.
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// ── Outputs ─────────────────────────────────────────────────────────────────
// These are exactly the three values we need to fill into parameters/dev.json.

output vnetId string = vnet.id
output vnetName string = vnet.name
output peSubnetId string = peSubnet.id
output acaSubnetId string = acaSubnet.id
output logAnalyticsId string = logAnalytics.id
output containerAppName string = placeholderApp.name
output containerAppFqdn string = placeholderApp.properties.configuration.ingress.fqdn
output containerAppPrincipalId string = placeholderApp.identity.principalId
