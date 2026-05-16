'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexSwitcher', {
  loadState: () => ipcRenderer.invoke('state:load'),
  refreshUsageState: (force = false) => ipcRenderer.invoke('state:refresh-usage', { force }),
  createProfile: (name) => ipcRenderer.invoke('profile:create', { name }),
  createProfileWithOAuth: () => ipcRenderer.invoke('profile:create-oauth'),
  cancelOAuthLogin: () => ipcRenderer.invoke('profile:cancel-oauth'),
  importAuthProfile: () => ipcRenderer.invoke('profile:import-auth'),
  renameProfile: (profileId, newName) =>
    ipcRenderer.invoke('profile:rename', { profileId, newName }),
  reorderProfiles: (profileIds) => ipcRenderer.invoke('profile:reorder', { profileIds }),
  deleteProfile: (profileId) => ipcRenderer.invoke('profile:delete', { profileId }),
  applyProfile: (profileId, relaunch = true) =>
    ipcRenderer.invoke('profile:apply', { profileId, relaunch }),
  restartCodex: () => ipcRenderer.invoke('codex:restart'),
  openProfilesFolder: () => ipcRenderer.invoke('folder:open-profiles')
});
