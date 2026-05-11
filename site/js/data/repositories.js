/**
 * data/repositories.js - Focused HTTP repositories for persisted app data.
 */
const DataRepositories = (() => {
  const inventory = {
    putSlot(boxId, slotIdx, slotData) {
      return ApiClient.put(`/api/inventory/${boxId}/${slotIdx}`, slotData);
    },
    deleteSlot(boxId, slotIdx) {
      return ApiClient.delete(`/api/inventory/${boxId}/${slotIdx}`);
    },
    moveSlot(fromBox, fromSlot, toBox, toSlot) {
      return ApiClient.post('/api/inventory/move', {
        from_box: fromBox,
        from_slot: fromSlot,
        to_box: toBox,
        to_slot: toSlot,
      });
    },
    renameBox(boxId, name) {
      return ApiClient.put(`/api/inventory/${boxId}`, { name });
    },
    batchOps(operations) {
      return ApiClient.post('/api/inventory/batch', { operations });
    },
  };

  const builds = {
    async create(buildDraft) {
      const stored = StorageMappers.unflattenStoredBuild(buildDraft);
      const result = await ApiClient.post('/api/builds', stored);
      return StorageMappers.flattenStoredBuild(result);
    },
    async update(id, buildDraft) {
      const stored = StorageMappers.unflattenStoredBuild(buildDraft);
      const result = await ApiClient.put(`/api/builds/${id}`, stored);
      return StorageMappers.flattenStoredBuild(result);
    },
    delete(id) {
      return ApiClient.delete(`/api/builds/${id}`);
    },
  };

  const teams = {
    create(teamPayload) {
      return ApiClient.post('/api/teams', teamPayload);
    },
    update(id, teamPayload) {
      return ApiClient.put(`/api/teams/${id}`, teamPayload);
    },
    delete(id) {
      return ApiClient.delete(`/api/teams/${id}`);
    },
  };

  return { inventory, builds, teams };
})();

if (typeof window !== 'undefined') {
  window.DataRepositories = DataRepositories;
}
