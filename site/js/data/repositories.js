import { ApiClient } from './api-client.js';
import { StorageMappers } from './storage-mappers.js';

/**
 * data/repositories.js - Focused HTTP repositories for persisted app data.
 */
export const DataRepositories = (() => {
  const inventory = {
    /** @param {number} boxId @param {number} slotIdx @param {import('../types/contracts.js').SlotStorage} slotData */
    putSlot(boxId, slotIdx, slotData) {
      return ApiClient.put(`/api/inventory/${boxId}/${slotIdx}`, slotData);
    },
    /** @param {number} boxId @param {number} slotIdx */
    deleteSlot(boxId, slotIdx) {
      return ApiClient.delete(`/api/inventory/${boxId}/${slotIdx}`);
    },
    /** @param {number} fromBox @param {number} fromSlot @param {number} toBox @param {number} toSlot */
    moveSlot(fromBox, fromSlot, toBox, toSlot) {
      return ApiClient.post('/api/inventory/move', {
        from_box: fromBox,
        from_slot: fromSlot,
        to_box: toBox,
        to_slot: toSlot,
      });
    },
    /** @param {number} boxId @param {string} name */
    renameBox(boxId, name) {
      return ApiClient.put(`/api/inventory/${boxId}`, { name });
    },
    /** @param {object[]} operations */
    batchOps(operations) {
      return ApiClient.post('/api/inventory/batch', { operations });
    },
  };

  const builds = {
    /** @param {import('../types/contracts.js').BuildState} buildDraft */
    async create(buildDraft) {
      const stored = StorageMappers.unflattenStoredBuild(buildDraft);
      if (!stored) throw new Error('A build is required');
      /** @type {import('../types/contracts.js').StoredBuild} */
      const result = await ApiClient.post('/api/builds', stored);
      return StorageMappers.flattenStoredBuild(result);
    },
    /** @param {string} id @param {import('../types/contracts.js').BuildState} buildDraft */
    async update(id, buildDraft) {
      const stored = StorageMappers.unflattenStoredBuild(buildDraft);
      if (!stored) throw new Error('A build is required');
      /** @type {import('../types/contracts.js').StoredBuild} */
      const result = await ApiClient.put(`/api/builds/${id}`, stored);
      return StorageMappers.flattenStoredBuild(result);
    },
    /** @param {string} id */
    delete(id) {
      return ApiClient.delete(`/api/builds/${id}`);
    },
  };

  const teams = {
    /** @param {import('../types/contracts.js').Team} teamPayload */
    create(teamPayload) {
      return ApiClient.post('/api/teams', teamPayload);
    },
    /** @param {string} id @param {import('../types/contracts.js').Team} teamPayload */
    update(id, teamPayload) {
      return ApiClient.put(`/api/teams/${id}`, teamPayload);
    },
    /** @param {string} id */
    delete(id) {
      return ApiClient.delete(`/api/teams/${id}`);
    },
  };

  return { inventory, builds, teams };
})();
