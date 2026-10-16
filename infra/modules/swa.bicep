// Static Web App module — Free plan; existing storage configuration is transferred separately.

@description('SWA resource name')
param swaName string

@description('Azure region')
param location string

@description('GitHub repo owner')
param repoOwner string

@description('GitHub repo name')
param repoName string

@description('GitHub branch')
param repoBranch string

@description('Resource tags')
param tags object

resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    repositoryUrl: 'https://github.com/${repoOwner}/${repoName}'
    branch: repoBranch
    buildProperties: {
      appLocation: 'site'
      apiLocation: 'api'
      outputLocation: ''
      skipGithubActionWorkflowGeneration: true
    }
  }
}

output defaultHostname string = swa.properties.defaultHostname
output resourceId string = swa.id
