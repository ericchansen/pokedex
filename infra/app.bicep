// ──────────────────────────────────────────────────────────────────
// App Layer — SWA + managed identity with cross-RG storage access
// Deploy: az deployment sub create --location eastus2 \
//         --template-file infra/app.bicep --parameters infra/app.bicepparam
// Teardown: az group delete -n rg-pokemon-app --yes
//   (safe — storage is in rg-pokemon-data with CanNotDelete lock)
// ──────────────────────────────────────────────────────────────────

targetScope = 'subscription'

@description('Name of the app resource group')
param resourceGroupName string

@description('Azure region')
param location string

@description('SWA resource name')
param swaName string

@description('GitHub repo owner')
param repoOwner string

@description('GitHub repo name')
param repoName string

@description('GitHub branch to deploy from')
param repoBranch string = 'main'

@description('Data resource group name (where storage lives)')
param dataResourceGroupName string

@description('Storage account name (in data RG)')
param storageAccountName string

@description('Tags applied to all resources')
param tags object = {
  project: 'pokemon-tracker'
  layer: 'app'
}

// ── Resource Group ──────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// ── Static Web App ──────────────────────────────────────────────

module swa 'modules/swa.bicep' = {
  name: 'swa-${swaName}'
  scope: rg
  params: {
    swaName: swaName
    location: location
    repoOwner: repoOwner
    repoName: repoName
    repoBranch: repoBranch
    tags: tags
  }
}

// ── Role Assignment (cross-RG) ──────────────────────────────────

module roleAssignment 'modules/storage-role.bicep' = {
  name: 'role-blob-contributor'
  scope: resourceGroup(dataResourceGroupName)
  params: {
    storageAccountName: storageAccountName
    principalId: swa.outputs.principalId
  }
}

// ── Outputs ─────────────────────────────────────────────────────

output swaDefaultHostname string = swa.outputs.defaultHostname
output swaResourceId string = swa.outputs.resourceId
output swaPrincipalId string = swa.outputs.principalId
