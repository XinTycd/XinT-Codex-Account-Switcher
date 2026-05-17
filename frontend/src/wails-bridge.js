import {
  ApplyProfile,
  CancelOAuthLogin,
  ChooseAppDataFolder,
  CreateProfile,
  CreateProfileWithOAuth,
  DeleteProfile,
  ExportAuthJson,
  ImportAuthProfile,
  LoadState,
  OpenExternal,
  OpenProfilesFolder,
  OpenUserDataFolder,
  RefreshUsageState,
  RenameProfile,
  ReorderProfiles,
  RestartCodex,
  SaveSettings
} from '../wailsjs/go/main/App.js';

window.codexSwitcher = {
  loadState: () => LoadState(),
  refreshUsageState: (force = false) => RefreshUsageState(force),
  createProfile: (name) => CreateProfile(name ?? ''),
  createProfileWithOAuth: () => CreateProfileWithOAuth(),
  cancelOAuthLogin: () => CancelOAuthLogin(),
  importAuthProfile: () => ImportAuthProfile(),
  renameProfile: (profileId, newName) => RenameProfile(profileId, newName),
  reorderProfiles: (profileIds) => ReorderProfiles(profileIds),
  deleteProfile: (profileId) => DeleteProfile(profileId),
  exportAuthJson: (profileId, profileName) => ExportAuthJson(profileId, profileName),
  applyProfile: (profileId, relaunch = true) => ApplyProfile(profileId, relaunch),
  restartCodex: () => RestartCodex(),
  openProfilesFolder: () => OpenProfilesFolder(),
  openUserDataFolder: () => OpenUserDataFolder(),
  chooseAppDataFolder: () => ChooseAppDataFolder(),
  openExternal: (url) => OpenExternal(url),
  saveSettings: (settings) => SaveSettings(settings)
};
