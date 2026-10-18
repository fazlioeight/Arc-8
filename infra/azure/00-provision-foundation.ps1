param(
    [string]$SubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
    [string]$ResourceGroup = "rg-nexora-prod",
    [string]$Location = "eastus2",
    [string]$NamePrefix = "nexora",
    [string]$PostgresAdminUser = "nexoraadmin",
    [string]$PostgresAdminPassword = $env:NEXORA_POSTGRES_ADMIN_PASSWORD,
    [string]$PostgresSku = "Standard_D2ds_v5",
    [string]$RedisSku = "Balanced_B0",
    [string]$OutputPath = "$PSScriptRoot\azure-foundation.outputs.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-Suffix {
    -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
}

function Require-AzCli {
    az version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI is required. Install it, then run 'az login'."
    }
}

Require-AzCli

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
}

if (-not $PostgresAdminPassword) {
    throw "Set NEXORA_POSTGRES_ADMIN_PASSWORD or pass -PostgresAdminPassword. Do not commit this value."
}

$suffix = New-Suffix
$safePrefix = ($NamePrefix.ToLower() -replace '[^a-z0-9-]', '')
$acrName = (($safePrefix -replace '-', '') + "acr" + $suffix)
$storageName = (($safePrefix -replace '-', '') + "st" + $suffix)
$keyVaultName = "$safePrefix-kv-$suffix"
$serviceBusNamespace = "$safePrefix-sb-$suffix"
$postgresServer = "$safePrefix-pg-$suffix"
$redisName = "$safePrefix-redis-$suffix"
$logWorkspace = "$safePrefix-law-$suffix"
$vnetName = "$safePrefix-vnet"
$acaSubnetName = "aca-infra"
$postgresSubnetName = "postgres"
$containerAppEnv = "$safePrefix-aca-env"
$rawContainer = "raw-ingest"
$processedContainer = "processed-ingest"
$documentsContainer = "documents"
$serviceBusQueue = "customer-ingestion"

az extension add --name containerapp --upgrade --only-show-errors
az extension add --name redisenterprise --upgrade --only-show-errors

az group create --name $ResourceGroup --location $Location --tags app=nexora env=prod

az network vnet create `
    --resource-group $ResourceGroup `
    --location $Location `
    --name $vnetName `
    --address-prefixes "10.20.0.0/16" `
    --subnet-name $acaSubnetName `
    --subnet-prefixes "10.20.0.0/23"

$acaSubnetId = az network vnet subnet show `
    --resource-group $ResourceGroup `
    --vnet-name $vnetName `
    --name $acaSubnetName `
    --query id -o tsv

az monitor log-analytics workspace create `
    --resource-group $ResourceGroup `
    --workspace-name $logWorkspace `
    --location $Location

$logWorkspaceId = az monitor log-analytics workspace show `
    --resource-group $ResourceGroup `
    --workspace-name $logWorkspace `
    --query customerId -o tsv

$logWorkspaceKey = az monitor log-analytics workspace get-shared-keys `
    --resource-group $ResourceGroup `
    --workspace-name $logWorkspace `
    --query primarySharedKey -o tsv

az containerapp env create `
    --name $containerAppEnv `
    --resource-group $ResourceGroup `
    --location $Location `
    --infrastructure-subnet-resource-id $acaSubnetId `
    --logs-workspace-id $logWorkspaceId `
    --logs-workspace-key $logWorkspaceKey `
    --zone-redundant true

az acr create `
    --resource-group $ResourceGroup `
    --name $acrName `
    --location $Location `
    --sku Standard `
    --admin-enabled false

az keyvault create `
    --resource-group $ResourceGroup `
    --name $keyVaultName `
    --location $Location `
    --enable-purge-protection true `
    --retention-days 90

$signedInUserId = az ad signed-in-user show --query id -o tsv
if ($signedInUserId) {
    az keyvault set-policy `
        --resource-group $ResourceGroup `
        --name $keyVaultName `
        --object-id $signedInUserId `
        --secret-permissions get list set delete recover backup restore
}

az storage account create `
    --resource-group $ResourceGroup `
    --name $storageName `
    --location $Location `
    --sku Standard_ZRS `
    --kind StorageV2 `
    --min-tls-version TLS1_2 `
    --https-only true `
    --allow-blob-public-access false

foreach ($containerName in @($rawContainer, $processedContainer, $documentsContainer)) {
    az storage container create `
        --account-name $storageName `
        --name $containerName `
        --auth-mode login | Out-Null
}

az servicebus namespace create `
    --resource-group $ResourceGroup `
    --name $serviceBusNamespace `
    --location $Location `
    --sku Standard

az servicebus queue create `
    --resource-group $ResourceGroup `
    --namespace-name $serviceBusNamespace `
    --name $serviceBusQueue `
    --enable-dead-lettering-on-message-expiration true `
    --max-delivery-count 5 `
    --default-message-time-to-live P14D

az postgres flexible-server create `
    --resource-group $ResourceGroup `
    --name $postgresServer `
    --location $Location `
    --admin-user $PostgresAdminUser `
    --admin-password $PostgresAdminPassword `
    --sku-name $PostgresSku `
    --tier GeneralPurpose `
    --version 16 `
    --storage-size 128 `
    --backup-retention 14 `
    --geo-redundant-backup Enabled `
    --zonal-resiliency Enabled `
    --allow-same-zone `
    --vnet $vnetName `
    --subnet $postgresSubnetName `
    --subnet-prefixes "10.20.2.0/24" `
    --public-access None `
    --yes

foreach ($dbName in @("nexora_control", "nexora_tenant")) {
    az postgres flexible-server db create `
        --resource-group $ResourceGroup `
        --server-name $postgresServer `
        --database-name $dbName | Out-Null
}

az redisenterprise create `
    --resource-group $ResourceGroup `
    --cluster-name $redisName `
    --location $Location `
    --sku $RedisSku `
    --minimum-tls-version "1.2" `
    --client-protocol Encrypted `
    --access-keys-authentication Enabled `
    --high-availability Enabled

$redisDatabaseExists = $true
az redisenterprise database show `
    --resource-group $ResourceGroup `
    --cluster-name $redisName *> $null
if ($LASTEXITCODE -ne 0) {
    $redisDatabaseExists = $false
}

if (-not $redisDatabaseExists) {
    az redisenterprise database create `
        --resource-group $ResourceGroup `
        --cluster-name $redisName `
        --client-protocol Encrypted `
        --access-keys-authentication Enabled | Out-Null
}

$pgHost = "$postgresServer.postgres.database.azure.com"
$controlDbUrl = "postgresql+asyncpg://${PostgresAdminUser}:${PostgresAdminPassword}@${pgHost}:5432/nexora_control?ssl=require"
$tenantDbUrl = "postgresql+asyncpg://${PostgresAdminUser}:${PostgresAdminPassword}@${pgHost}:5432/nexora_tenant?ssl=require"
$secretBytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($secretBytes)
$secretKey = [Convert]::ToBase64String($secretBytes)
$storageConnection = az storage account show-connection-string `
    --resource-group $ResourceGroup `
    --name $storageName `
    --query connectionString -o tsv
$serviceBusConnection = az servicebus namespace authorization-rule keys list `
    --resource-group $ResourceGroup `
    --namespace-name $serviceBusNamespace `
    --name RootManageSharedAccessKey `
    --query primaryConnectionString -o tsv

$redisHost = az redisenterprise show `
    --resource-group $ResourceGroup `
    --cluster-name $redisName `
    --query hostName -o tsv
$redisKey = az redisenterprise database list-keys `
    --resource-group $ResourceGroup `
    --cluster-name $redisName `
    --query primaryKey -o tsv
$redisUrl = "rediss://:${redisKey}@${redisHost}:10000/0"

$secrets = @{
    "secret-key" = $secretKey
    "control-db-url" = $controlDbUrl
    "tenant-db-url" = $tenantDbUrl
    "redis-url" = $redisUrl
    "storage-connection-string" = $storageConnection
    "servicebus-connection-string" = $serviceBusConnection
}

foreach ($name in $secrets.Keys) {
    az keyvault secret set --vault-name $keyVaultName --name $name --value $secrets[$name] | Out-Null
}

$outputs = [ordered]@{
    resourceGroup = $ResourceGroup
    location = $Location
    acrName = $acrName
    containerAppEnvironment = $containerAppEnv
    keyVaultName = $keyVaultName
    storageAccountName = $storageName
    serviceBusNamespace = $serviceBusNamespace
    serviceBusQueue = $serviceBusQueue
    postgresServer = $postgresServer
    redisName = $redisName
    vnetName = $vnetName
}

$json = $outputs | ConvertTo-Json -Depth 4
if ($OutputPath) {
    $resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $outputDir = Split-Path -Parent $resolvedOutputPath
    if ($outputDir -and -not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    Set-Content -Path $resolvedOutputPath -Value $json -Encoding UTF8
    Write-Host "Wrote foundation outputs to $resolvedOutputPath"
}
$json
