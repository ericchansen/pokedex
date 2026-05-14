using 'data.bicep'

param resourceGroupName = 'rg-pokemon-data'
param location = 'eastus2'
param storageAccountName = 'stpokemontracker'
param containerName = 'userdata'
param versionRetentionDays = 90
param softDeleteRetentionDays = 7
