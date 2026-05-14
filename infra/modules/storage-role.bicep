// Assigns Storage Blob Data Contributor role to a principal on a storage account

@description('Storage account name')
param storageAccountName string

@description('Principal ID to grant access (e.g., SWA managed identity)')
param principalId string

// Storage Blob Data Contributor built-in role
var storageBlobDataContributorRole = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageBlobDataContributorRole)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRole)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
