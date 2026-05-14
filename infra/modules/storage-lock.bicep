// CanNotDelete lock on the storage account — prevents accidental deletion.
// Must be explicitly removed before the storage account can be deleted.

@description('Storage account name to lock')
param storageAccountName string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource deleteLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: '${storageAccountName}-no-delete'
  scope: storageAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Protects user data storage from accidental deletion. Remove this lock explicitly before any destructive operations.'
  }
}
