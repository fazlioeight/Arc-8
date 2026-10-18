// Greenfield-deployable Bicep for the Nexora chat stack.
//
// Given a fresh resource group and the required @secure() parameters, this
// template provisions everything the chat workload needs:
//
//   * VNet (own address space) with delegated aca-subnet, delegated
//     postgres-subnet, and a pe-subnet with NetworkPolicies disabled
//   * Log Analytics + Application Insights
//   * Storage account with the `workbooks` Azure File share
//   * Azure Container Registry (admin disabled — pull via MI)
//   * Key Vault — created with public access enabled so the deployer can
//     seed initial secrets, then locked down via the 05 PE script
//   * Postgres Flexible Server — VNet-injected (no public endpoint at all),
//     with a private DNS zone for its FQDN
//   * Container Apps environment, VNet-integrated on aca-subnet
//   * Storage definition + Container App `nexora-chat` with system-assigned
//     MI, KV-ref secrets, AzureFile volume mount, ACR pull via MI
//   * 4 Container Apps Jobs (ddl, migrations, path2-ddl, tenant-provision)
//     all on the same env, using KV-ref secrets via system-assigned MI
//   * Private endpoint + DNS zone for Key Vault (cross-region safe)
//   * Role assignments (MI → AcrPull on ACR, KV Secrets User on KV)
//
// This deliberately differs from the *current live state* in two ways:
//
//   1. Live chat uses the dev VNet (`rg-nexora-dev/nexora-dev-vnet`); this
//      template creates its own `nexora-chat-vnet` for full isolation.
//   2. Live Postgres uses a public-access server with a Private Endpoint
//      attached. This template uses VNet injection on a delegated subnet,
//      so the server has no public listener at all. VNet injection is the
//      cleaner pattern for a brand-new server; PE-on-public-server is what
//      you do when you have to remediate an existing public server in
//      place without recreating it.
//
// Run with:
//   az deployment group create \
//     -g <rg> \
//     -f infra/azure/bicep/chat.bicep \
//     -p @parameters/chat.json \
//     -p postgresAdminPassword=$env:NEXORA_POSTGRES_ADMIN_PASSWORD \
//     -p platformSecretKey=$env:NEXORA_PLATFORM_SECRET_KEY \
//     -p platformFieldEncryptionKey=$env:NEXORA_FIELD_ENCRYPTION_KEY \
//     -p anthropicApiKey=$env:NEXORA_ANTHROPIC_API_KEY \
//     -p initialAdminPassword=$env:NEXORA_INITIAL_ADMIN_PASSWORD

targetScope = 'resourceGroup'

// ── Parameters ─────────────────────────────────────────────────────────────

@description('Naming prefix; suffixes are added per resource type.')
@minLength(5)
@maxLength(20)
param namePrefix string = 'nexora-chat'

@description('Region for all resources except cross-region exceptions.')
param location string = resourceGroup().location

@description('Tags applied to every resource.')
param tags object = {
  app: 'nexora'
  workload: 'chat'
  'managed-by': 'bicep'
}

@description('VNet address space. /16 leaves room for future subnets.')
param vnetAddressPrefix string = '10.30.0.0/16'

@description('Subnet for the Container Apps Env (delegated).')
param acaSubnetPrefix string = '10.30.0.0/23'

@description('Subnet for Postgres Flexible Server (delegated).')
param postgresSubnetPrefix string = '10.30.2.0/24'

@description('Subnet for Private Endpoints (NetworkPolicies disabled).')
param peSubnetPrefix string = '10.30.4.0/24'

@description('Image tag the container app and jobs run.')
param containerImage string = 'nexorachatacr.azurecr.io/nexora-platform:latest'

@description('Postgres admin user.')
param postgresAdminUser string = 'nexoraadmin'

@description('Postgres admin password.')
@secure()
param postgresAdminPassword string

@description('Postgres SKU tier name.')
param postgresSkuName string = 'Standard_D2ds_v5'

@description('Postgres storage size in GiB.')
param postgresStorageGB int = 128

@description('Tenant database name (created in addition to control).')
param tenantDatabaseName string = 'nexora_tenant_prominencehealth'

@description('Control database name.')
param controlDatabaseName string = 'nexora_control'

@description('Platform secret key (FastAPI session signing).')
@secure()
param platformSecretKey string

@description('Field-level encryption key (Fernet).')
@secure()
param platformFieldEncryptionKey string

@description('Anthropic API key.')
@secure()
param anthropicApiKey string

@description('Initial admin password (consumed by tenant-provision job).')
@secure()
param initialAdminPassword string

@description('Microsoft OAuth provider client secret. Empty disables MS auth.')
@secure()
param microsoftProviderAuthSecret string = ''

@description('Comma-separated allowed emails (login allowlist).')
param allowedEmails string = ''

@description('CORS origin (the Static Web App URL).')
param corsOrigins string = ''

@description('Default Claude streaming model.')
param claudeModel string = 'claude-sonnet-4-6'

@description('Default Anthropic model for plain chat.')
param anthropicModel string = 'claude-opus-4-7'

@description('Tenant key for the initial tenant.')
param initialTenantKey string = 'prominencehealth'

@description('Initial admin email passed to provision job.')
param initialAdminEmail string = 'admin@nexora.local'

// ── Networking ─────────────────────────────────────────────────────────────

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${namePrefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [ vnetAddressPrefix ]
    }
    subnets: [
      {
        name: 'aca-subnet'
        properties: {
          addressPrefix: acaSubnetPrefix
          delegations: [
            {
              name: 'aca-delegation'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: 'postgres-subnet'
        properties: {
          addressPrefix: postgresSubnetPrefix
          delegations: [
            {
              name: 'postgres-delegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
      {
        name: 'pe-subnet'
        properties: {
          addressPrefix: peSubnetPrefix
          // Required for Private Endpoint NIC creation.
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource acaSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'aca-subnet'
}

resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'postgres-subnet'
}

resource peSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing = {
  parent: vnet
  name: 'pe-subnet'
}

// ── Private DNS zones ──────────────────────────────────────────────────────
// PG VNet injection uses a custom private zone for FQDN resolution.
// KV uses the standard privatelink zone wired to a PE.

resource pgPrivateZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: '${namePrefix}-pg.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource pgPrivateZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: pgPrivateZone
  name: '${vnet.name}-link'
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

resource kvPrivateZone 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: tags
}

resource kvPrivateZoneLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: kvPrivateZone
  name: '${vnet.name}-link'
  location: 'global'
  tags: tags
  properties: {
    virtualNetwork: { id: vnet.id }
    registrationEnabled: false
  }
}

// ── Observability ──────────────────────────────────────────────────────────

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ── Storage (AzureFile share for workbooks volume) ─────────────────────────

var storageAccountName = toLower(replace('${namePrefix}stor', '-', ''))

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  #disable-next-line BCP334
  name: take(storageAccountName, 24)
  location: location
  tags: tags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource storageFileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource workbooksShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: storageFileService
  name: 'workbooks'
  properties: {
    accessTier: 'TransactionOptimized'
    enabledProtocols: 'SMB'
  }
}

// ── Container Registry ─────────────────────────────────────────────────────

var acrName = toLower(replace('${namePrefix}acr', '-', ''))

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  #disable-next-line BCP334
  name: take(acrName, 50)
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// ── Key Vault ──────────────────────────────────────────────────────────────
// Created with public access on so the deployer can `az keyvault secret set`
// the initial values during/after deployment. The 05 PE script is what
// flips publicNetworkAccess to Disabled once seeding is done.

resource keyVault 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: '${namePrefix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource keyVaultPe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${keyVault.name}-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: peSubnet.id }
    privateLinkServiceConnections: [
      {
        name: '${keyVault.name}-pe-conn'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [ 'vault' ]
        }
      }
    ]
  }
}

resource keyVaultPeDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: keyVaultPe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'vault'
        properties: { privateDnsZoneId: kvPrivateZone.id }
      }
    ]
  }
}

// Seed the KV with the inbound secrets so the container app can resolve
// its KV-ref secrets on first start. Subsequent rotations are out of band.

var kvSecretMap = {
  'platform-secret-key': platformSecretKey
  'platform-field-encryption-key': platformFieldEncryptionKey
  'anthropic-api-key': anthropicApiKey
  'platform-initial-admin-password': initialAdminPassword
  'microsoft-provider-authentication-secret': microsoftProviderAuthSecret
}

resource kvSeededSecrets 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = [for name in items(kvSecretMap): if (length(name.value) > 0) {
  parent: keyVault
  name: name.key
  properties: {
    value: name.value
  }
}]

// ── Postgres Flexible Server (VNet-injected, no public endpoint) ──────────

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg'
  location: location
  tags: tags
  sku: { name: postgresSkuName, tier: 'GeneralPurpose' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: postgresStorageGB }
    backup: { backupRetentionDays: 14, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: {
      delegatedSubnetResourceId: postgresSubnet.id
      privateDnsZoneArmResourceId: pgPrivateZone.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [ pgPrivateZoneLink ]
}

resource postgresControlDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: controlDatabaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource postgresTenantDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: tenantDatabaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Seed the connection-string secrets into KV. The app and jobs consume
// these via secretRef; storing them here keeps the password-baked URLs out
// of any non-secret artifact.
var pgHost = '${postgres.name}.private.postgres.database.azure.com'

resource kvControlDbUrl 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: keyVault
  name: 'platform-control-db-url'
  properties: {
    value: 'postgresql+asyncpg://${postgresAdminUser}:${postgresAdminPassword}@${pgHost}:5432/${controlDatabaseName}?ssl=require'
  }
}

resource kvTenantDbUrl 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: keyVault
  name: 'platform-tenant-db-url'
  properties: {
    value: 'postgresql+asyncpg://${postgresAdminUser}:${postgresAdminPassword}@${pgHost}:5432/${tenantDatabaseName}?ssl=require'
  }
}

resource kvControlDbUrlSync 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: keyVault
  name: 'platform-control-db-url-sync'
  properties: {
    value: 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${pgHost}:5432/${controlDatabaseName}?sslmode=require'
  }
}

resource kvTenantDbUrlPsycopg 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: keyVault
  name: 'platform-tenant-db-url-psycopg'
  properties: {
    value: 'postgresql://${postgresAdminUser}:${postgresAdminPassword}@${pgHost}:5432/${tenantDatabaseName}?sslmode=require'
  }
}

// ── Container Apps Environment (VNet-integrated) ───────────────────────────

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
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
      internal: false
    }
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
  }
}

// Bind the AzureFile share to the env so any app/job can mount it.
resource acaEnvWorkbooksStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: acaEnv
  name: 'workbooks'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: workbooksShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ── Container App (chat) ───────────────────────────────────────────────────
// MI is system-assigned. ACR pull and KV access are granted via roles
// further down. KV-ref secrets are wired so secret rotations only require
// updating KV, not the container app.

resource chatApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: namePrefix
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'platform-secret-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-secret-key'
          identity: 'system'
        }
        {
          name: 'platform-field-encryption-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-field-encryption-key'
          identity: 'system'
        }
        {
          name: 'platform-control-db-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-control-db-url'
          identity: 'system'
        }
        {
          name: 'platform-tenant-db-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-tenant-db-url'
          identity: 'system'
        }
        {
          name: 'anthropic-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/anthropic-api-key'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: namePrefix
          image: containerImage
          resources: { cpu: 2, memory: '4Gi' }
          env: [
            { name: 'APP_ENV', value: 'production' }
            { name: 'ENVIRONMENT', value: 'production' }
            { name: 'HIPAA_MODE', value: 'true' }
            { name: 'ALLOW_DUMMY_LOGIN', value: 'false' }
            { name: 'ALLOWED_ORIGINS', value: '*' }
            { name: 'ALLOWED_EMAILS', value: allowedEmails }
            { name: 'CORS_ORIGINS', value: corsOrigins }
            { name: 'CLAUDE_MODEL', value: claudeModel }
            { name: 'ANTHROPIC_MODEL', value: anthropicModel }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'KEY_VAULT_URL', value: keyVault.properties.vaultUri }
            { name: 'MAX_FILE_CHARS', value: '120000' }
            { name: 'WORKBOOK_DATA_DIR', value: '/mnt/workbooks' }
            { name: 'REDIS_URL', value: '' }
            { name: 'AUDIT_LOG_PATH', value: '' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'SECRET_KEY', secretRef: 'platform-secret-key' }
            { name: 'FIELD_ENCRYPTION_KEY', secretRef: 'platform-field-encryption-key' }
            { name: 'CONTROL_DATABASE_URL', secretRef: 'platform-control-db-url' }
            { name: 'DEFAULT_TENANT_DATABASE_URL', secretRef: 'platform-tenant-db-url' }
          ]
          volumeMounts: [
            { mountPath: '/mnt/workbooks', volumeName: 'workbooks' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
      volumes: [
        {
          name: 'workbooks'
          storageName: 'workbooks'
          storageType: 'AzureFile'
          mountOptions: 'uid=0,gid=0,file_mode=0777,dir_mode=0777,nobrl'
        }
      ]
    }
  }
  // Note: role assignments (chatAppAcrPull, chatAppKvSecretsUser) cannot
  // appear in dependsOn because they reference chatApp.identity.principalId
  // — that would be a cycle. They are created in parallel; if MI role
  // propagation lags the first revision, redeploy. Subsequent revisions
  // pick up the existing roles.
  dependsOn: [
    kvSeededSecrets
    kvControlDbUrl
    kvTenantDbUrl
    acaEnvWorkbooksStorage
  ]
}

// ── Container Apps Jobs (manual triggers; operational tools) ──────────────
// All four jobs share the same image and use system-assigned MIs. Secrets
// are KV-refs (modernized from the legacy value-based pattern). Each MI
// gets its own AcrPull + KV Secrets User grant below.

resource migrationsJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-migrations'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [
        { server: acr.properties.loginServer, identity: 'system' }
      ]
      secrets: [
        { name: 'secret-key', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-secret-key', identity: 'system' }
        { name: 'field-encryption-key', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-field-encryption-key', identity: 'system' }
        { name: 'control-db-url', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-control-db-url', identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrations'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          command: [ 'python' ]
          args: [ 'scripts/apply_control_ddl.py' ]
          env: [
            { name: 'ENVIRONMENT', value: 'production' }
            { name: 'PYTHONPATH', value: '/app' }
            { name: 'SECRET_KEY', secretRef: 'secret-key' }
            { name: 'FIELD_ENCRYPTION_KEY', secretRef: 'field-encryption-key' }
            { name: 'CONTROL_DATABASE_URL', secretRef: 'control-db-url' }
          ]
        }
      ]
    }
  }
}

resource tenantDdlJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-tenant-ddl'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [ { server: acr.properties.loginServer, identity: 'system' } ]
      secrets: [
        { name: 'tenant-db-url-psycopg', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-tenant-db-url-psycopg', identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'tenant-ddl'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          command: [ 'python' ]
          args: [ 'scripts/apply_tenant_ddl.py' ]
          env: [
            { name: 'PYTHONPATH', value: '/app' }
            { name: 'TENANT_DATABASE_URL_PSYCOPG', secretRef: 'tenant-db-url-psycopg' }
          ]
        }
      ]
    }
  }
}

resource path2DdlJob 'Microsoft.App/jobs@2024-03-01' = {
  // Stays under the 32-char job-name limit while keeping the prefix.
  name: '${namePrefix}-path2-ddl'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [ { server: acr.properties.loginServer, identity: 'system' } ]
      secrets: [
        { name: 'control-db-url-psycopg', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-control-db-url-sync', identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'path2-ddl'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          command: [ 'python' ]
          args: [ 'scripts/apply_path2_ddl.py' ]
          env: [
            { name: 'PYTHONPATH', value: '/app' }
            { name: 'CONTROL_DATABASE_URL_PSYCOPG', secretRef: 'control-db-url-psycopg' }
          ]
        }
      ]
    }
  }
}

resource tenantProvisionJob 'Microsoft.App/jobs@2024-03-01' = {
  // Shortened name: `${namePrefix}-tenant-provision` would blow the 32-char
  // job-name cap when namePrefix='nexora-chat'. Hardcoded prefix `nexora`
  // keeps it under the limit regardless of namePrefix.
  name: 'nexora-tenant-provision'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    environmentId: acaEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: [ { server: acr.properties.loginServer, identity: 'system' } ]
      secrets: [
        { name: 'secret-key', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-secret-key', identity: 'system' }
        { name: 'field-encryption-key', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-field-encryption-key', identity: 'system' }
        { name: 'control-db-url', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-control-db-url', identity: 'system' }
        { name: 'tenant-db-url', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-tenant-db-url', identity: 'system' }
        { name: 'initial-admin-password', keyVaultUrl: '${keyVault.properties.vaultUri}secrets/platform-initial-admin-password', identity: 'system' }
      ]
    }
    template: {
      containers: [
        {
          name: 'tenant-provision'
          image: containerImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          command: [ 'python' ]
          args: [ 'scripts/provision_initial_tenant.py' ]
          env: [
            { name: 'ENVIRONMENT', value: 'production' }
            { name: 'PYTHONPATH', value: '/app' }
            { name: 'INITIAL_TENANT_KEY', value: initialTenantKey }
            { name: 'INITIAL_TENANT_SLUG', value: initialTenantKey }
            { name: 'INITIAL_TENANT_NAME', value: initialTenantKey }
            { name: 'INITIAL_ADMIN_EMAIL', value: initialAdminEmail }
            { name: 'SECRET_KEY', secretRef: 'secret-key' }
            { name: 'FIELD_ENCRYPTION_KEY', secretRef: 'field-encryption-key' }
            { name: 'CONTROL_DATABASE_URL', secretRef: 'control-db-url' }
            { name: 'DEFAULT_TENANT_DATABASE_URL', secretRef: 'tenant-db-url' }
            { name: 'INITIAL_ADMIN_PASSWORD', secretRef: 'initial-admin-password' }
          ]
        }
      ]
    }
  }
}

// ── Role assignments ───────────────────────────────────────────────────────
// AcrPull and Key Vault Secrets User scoped to the chat MIs.

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource chatAppAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, chatApp.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: chatApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource chatAppKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, chatApp.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: chatApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Job MIs need the same grants. Each job gets explicit assignments — Bicep
// can't expand a for-loop over principalIds that aren't resolvable at
// deployment start.

resource migrationsAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, migrationsJob.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: migrationsJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource migrationsKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, migrationsJob.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: migrationsJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tenantDdlAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, tenantDdlJob.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: tenantDdlJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tenantDdlKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, tenantDdlJob.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: tenantDdlJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource path2DdlAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, path2DdlJob.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: path2DdlJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource path2DdlKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, path2DdlJob.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: path2DdlJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tenantProvisionAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, tenantProvisionJob.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: tenantProvisionJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource tenantProvisionKvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, tenantProvisionJob.id, kvSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId: tenantProvisionJob.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────

output resourceGroup string = resourceGroup().name
output vnetName string = vnet.name
output vnetId string = vnet.id
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output postgresServerName string = postgres.name
output postgresFqdn string = pgHost
output containerAppEnvironment string = acaEnv.name
output chatAppName string = chatApp.name
output chatAppFqdn string = chatApp.properties.configuration.ingress.fqdn
output chatAppPrincipalId string = chatApp.identity.principalId
output storageAccountName string = storage.name
output workbooksShareName string = workbooksShare.name
output logAnalyticsName string = logAnalytics.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
