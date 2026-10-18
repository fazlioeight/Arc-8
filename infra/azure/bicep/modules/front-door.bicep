// Azure Front Door (Premium) + WAF for the member portal — Option A edge.
//
// Single public entry for the member hostname, fronting two origins:
//   * default route  /*            -> member SPA (Static Web App)
//   * api route      /api/member/* -> member edge Container App (BFF proxy)
//
// WAF runs in Prevention mode with the Microsoft managed DRS rule set plus a
// rate-limit custom rule. Premium SKU is required for managed rule sets (and,
// later, Private Link origins for the fast-follow lockdown).
//
// The edge app should additionally reject any request not bearing this Front
// Door's X-Azure-FDID (the proxy enforces EXPECTED_FRONT_DOOR_ID) so the only
// path to /api/member/* is through this WAF.
//
//   az deployment group create -g <rg> -f modules/front-door.bicep \
//     -p namePrefix=nexora spaHostName=<swa-host> edgeHostName=<edge-aca-fqdn>

targetScope = 'resourceGroup'

@description('Naming prefix, e.g. "nexora".')
param namePrefix string = 'nexora'

@description('Default origin hostname — the member SPA Static Web App default host.')
param spaHostName string

@description('API origin hostname — the member edge Container App ingress FQDN.')
param edgeHostName string

@description('Requests per minute per client IP before the WAF rate-limit rule blocks.')
param rateLimitThreshold int = 600

param tags object = {
  app: 'nexora'
  'managed-by': 'bicep'
  component: 'member-portal-edge'
}

var profileName = '${namePrefix}-member-fd'
var endpointName = '${namePrefix}-member'
var wafPolicyName = '${replace(namePrefix, '-', '')}memberwaf'

resource profile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: profileName
  location: 'global'
  tags: tags
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
}

resource waf 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies@2022-05-01' = {
  name: wafPolicyName
  location: 'global'
  tags: tags
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'Microsoft_DefaultRuleSet'
          ruleSetVersion: '2.1'
          ruleSetAction: 'Block'
        }
        {
          ruleSetType: 'Microsoft_BotManagerRuleSet'
          ruleSetVersion: '1.0'
        }
      ]
    }
    customRules: {
      rules: [
        {
          name: 'memberRateLimit'
          priority: 1
          enabledState: 'Enabled'
          ruleType: 'RateLimitRule'
          rateLimitDurationInMinutes: 1
          rateLimitThreshold: rateLimitThreshold
          matchConditions: [
            {
              matchVariable: 'RequestUri'
              operator: 'Contains'
              matchValue: [
                '/'
              ]
            }
          ]
          action: 'Block'
        }
      ]
    }
  }
}

resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: profile
  name: endpointName
  location: 'global'
  tags: tags
  properties: {
    enabledState: 'Enabled'
  }
}

// --- SPA origin group + origin ----------------------------------------------
resource spaOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: profile
  name: 'spa-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 120
    }
  }
}

resource spaOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: spaOriginGroup
  name: 'spa-origin'
  properties: {
    hostName: spaHostName
    originHostHeader: spaHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

// --- Edge (API) origin group + origin ---------------------------------------
resource edgeOriginGroup 'Microsoft.Cdn/profiles/originGroups@2023-05-01' = {
  parent: profile
  name: 'edge-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/health/live'
      probeRequestType: 'GET'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 60
    }
  }
}

resource edgeOrigin 'Microsoft.Cdn/profiles/originGroups/origins@2023-05-01' = {
  parent: edgeOriginGroup
  name: 'edge-origin'
  properties: {
    hostName: edgeHostName
    originHostHeader: edgeHostName
    httpsPort: 443
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

// --- Routes -----------------------------------------------------------------
// API route is evaluated with a specific match; the SPA catch-all serves the rest.
resource apiRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'api-member-route'
  dependsOn: [
    edgeOrigin
  ]
  properties: {
    originGroup: {
      id: edgeOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/api/member/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    enabledState: 'Enabled'
  }
}

resource spaRoute 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'spa-route'
  dependsOn: [
    spaOrigin
  ]
  properties: {
    originGroup: {
      id: spaOriginGroup.id
    }
    supportedProtocols: [
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    httpsRedirect: 'Enabled'
    linkToDefaultDomain: 'Enabled'
    enabledState: 'Enabled'
  }
}

// --- Attach the WAF to the endpoint -----------------------------------------
resource securityPolicy 'Microsoft.Cdn/profiles/securityPolicies@2023-05-01' = {
  parent: profile
  name: 'member-waf-policy'
  properties: {
    parameters: {
      type: 'WebApplicationFirewall'
      wafPolicy: {
        id: waf.id
      }
      associations: [
        {
          domains: [
            {
              id: endpoint.id
            }
          ]
          patternsToMatch: [
            '/*'
          ]
        }
      ]
    }
  }
}

@description('The Front Door ID (X-Azure-FDID) — set this on the edge app as EXPECTED_FRONT_DOOR_ID so it only accepts traffic from this Front Door.')
output frontDoorId string = profile.properties.frontDoorId

@description('Default endpoint hostname; map the member custom domain here.')
output endpointHostName string = endpoint.properties.hostName
