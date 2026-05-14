// ──────────────────────────────────────────────────────────────────
// Data Layer — Storage account with versioning, soft-delete, and lock
// Deploy: az deployment sub create --location eastus2 \
//         --template-file infra/data.bicep --parameters infra/data.bicepparam
// ──────────────────────────────────────────────────────────────────

targetScope = 'subscription'

@description('Name of the data resource group')
param resourceGroupName string

@description('Azure region for all resources')
param location string

@description('Storage account name (3-24 lowercase alphanumeric)')
param storageAccountName string

@description('Blob container name for user data')
param containerName string = 'userdata'

@description('Days to retain non-current blob versions before auto-deletion')
param versionRetentionDays int = 90

@description('Days to retain soft-deleted blobs')
param softDeleteRetentionDays int = 7

@description('Tags applied to all resources')
param tags object = {
  project: 'pokemon-tracker'
  layer: 'data'
}

// ── Resource Group ──────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ── Storage Account ─────────────────────────────────────────────

module storage 'modules/storage.bicep' = {
  name: 'storage-${storageAccountName}'
  scope: rg
  params: {
    storageAccountName: storageAccountName
    location: location
    containerName: containerName
    versionRetentionDays: versionRetentionDays
    softDeleteRetentionDays: softDeleteRetentionDays
    tags: tags
  }
}

// ── CanNotDelete Lock ───────────────────────────────────────────

module lock 'modules/storage-lock.bicep' = {
  name: 'lock-${storageAccountName}'
  scope: rg
  params: {
    storageAccountName: storageAccountName
  }
  dependsOn: [storage]
}

// ── Outputs ─────────────────────────────────────────────────────

output resourceGroupName string = rg.name
output storageAccountName string = storage.outputs.storageAccountName
output storageAccountId string = storage.outputs.storageAccountId
output containerName string = containerName
