'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const {
  buildChatGptAuthRecord,
  DEFAULT_OAUTH_CLIENT_ID,
  parseChatGptIdentity,
  readAuthFile
} = require('./core/auth-store');
const { createDesktopOAuthFlow } = require('./core/oauth-login');
const {
  applyProfile,
  createProfileFromAuth,
  createProfileFromCurrent,
  deleteProfile,
  getProfileSnapshotDir,
  listProfiles,
  reorderProfiles,
  renameProfile,
  TRACKED_FILES
} = require('./core/profile-manager');
const {
  DEFAULT_APP_SETTINGS,
  getTrackedFilesForSettings,
  readAppSettings,
  writeAppSettings
} = require('./core/app-settings');
const {
  enrichCurrentState,
  enrichProfiles
} = require('./core/profile-usage');
const {
  getCodexRuntimeSummary,
  launchCodex,
  stopCodexProcesses
} = require('./core/codex-control');

const codexHome = path.join(os.homedir(), '.codex');
let activeOAuthFlow = null;
let currentUsageCache = null;
let appSettingsCache = { ...DEFAULT_APP_SETTINGS };
let stateCache = null;
let mainWindow = null;
let isQuitting = false;
let runtimeSummaryCache = {
  value: null,
  fetchedAt: 0
};

const RUNTIME_CACHE_TTL_MS = 3000;

function getProfilesRoot() {
  return path.join(getEffectiveAppDataPath(), 'profiles');
}

function getUserDataPath() {
  return app.getPath('userData');
}

function getEffectiveAppDataPath(settings = appSettingsCache) {
  return settings?.appDataPath || getUserDataPath();
}

function getBackupsRoot() {
  return path.join(getEffectiveAppDataPath(), 'backups');
}

async function loadAppSettings() {
  appSettingsCache = await readAppSettings(getUserDataPath());
  return appSettingsCache;
}

function getActiveTrackedFiles(settings = appSettingsCache) {
  return getTrackedFilesForSettings(settings, TRACKED_FILES);
}

async function buildState(overrides = {}) {
  const settings = appSettingsCache ?? await loadAppSettings();
  const trackedFiles = getActiveTrackedFiles(settings);
  const [profilesState, runtime] = await Promise.all([
    overrides.profilesState
      ? Promise.resolve(overrides.profilesState)
      : listProfiles(getProfilesRoot(), codexHome, { trackedFiles }),
    overrides.runtime
      ? Promise.resolve(overrides.runtime)
      : getRuntimeSummaryCached()
  ]);
  const current = overrides.current ?? buildCurrentStateFromCache(profilesState.current);
  const sourceProfiles = overrides.profiles ?? profilesState.profiles;
  const profiles = sourceProfiles.map((profile) => ({
    ...profile,
    isActive: current.identityKey != null && profile.identityKey === current.identityKey
  }));

  stateCache = {
    codexHome,
    defaultAppDataPath: getUserDataPath(),
    appDataPath: getEffectiveAppDataPath(settings),
    appVersion: `v${app.getVersion()}`,
    settings,
    trackedFiles,
    runtime,
    current,
    profiles
  };
  return stateCache;
}

function updateCachedSettingsState(settings) {
  if (!stateCache) {
    return null;
  }

  stateCache = {
    ...stateCache,
    defaultAppDataPath: getUserDataPath(),
    appDataPath: getEffectiveAppDataPath(settings),
    settings,
    trackedFiles: getActiveTrackedFiles(settings)
  };
  return stateCache;
}

function buildCurrentStateFromCache(currentSummary) {
  if (
    currentUsageCache?.identityKey
    && currentUsageCache.identityKey === currentSummary.identityKey
  ) {
    return {
      ...currentSummary,
      usage: currentUsageCache.usage ?? null,
      usageError: currentUsageCache.usageError ?? null,
      planType: currentUsageCache.planType ?? currentSummary.planType,
      accountId: currentUsageCache.accountId ?? currentSummary.accountId,
      email: currentUsageCache.email ?? currentSummary.email
    };
  }

  return {
    ...currentSummary,
    usage: null,
    usageError: null
  };
}

function updateCurrentUsageCache(currentState) {
  const previousCache = currentUsageCache;
  const sameIdentity = previousCache?.identityKey && previousCache.identityKey === currentState.identityKey;

  currentUsageCache = {
    identityKey: currentState.identityKey,
    usage: currentState.usage ?? (sameIdentity ? previousCache.usage ?? null : null),
    usageError: currentState.usageError ?? null,
    planType: currentState.planType ?? null,
    accountId: currentState.accountId ?? null,
    email: currentState.email ?? null,
    updatedAt: currentState.usage
      ? Date.now()
      : (sameIdentity ? previousCache.updatedAt ?? Date.now() : Date.now())
  };
}

function invalidateRuntimeSummaryCache() {
  runtimeSummaryCache = {
    value: null,
    fetchedAt: 0
  };
}

async function getRuntimeSummaryCached({ force = false } = {}) {
  if (!force && runtimeSummaryCache.value && Date.now() - runtimeSummaryCache.fetchedAt < RUNTIME_CACHE_TTL_MS) {
    return runtimeSummaryCache.value;
  }

  const runtime = await getCodexRuntimeSummary();
  runtimeSummaryCache = {
    value: runtime,
    fetchedAt: Date.now()
  };
  return runtime;
}

async function refreshUsageState({ force = false } = {}) {
  const trackedFiles = getActiveTrackedFiles();
  const profilesState = await listProfiles(getProfilesRoot(), codexHome, { trackedFiles });
  const [current, refreshedProfiles] = await Promise.all([
    enrichCurrentState(codexHome, { trackedFiles }),
    enrichProfiles(getProfilesRoot(), profilesState.profiles, { force, trackedFiles })
  ]);
  updateCurrentUsageCache(current);

  return buildState({
    profilesState,
    current,
    profiles: refreshedProfiles
  });
}

async function resolveOAuthClientId() {
  const currentAuth = await readAuthFile(codexHome);
  return currentAuth?.tokens?.access_token
    ? parseChatGptIdentity(currentAuth).clientId
    : DEFAULT_OAUTH_CLIENT_ID;
}

async function withErrorDialog(handler) {
  try {
    return await handler();
  } catch (error) {
    if (error?.code !== 'OAUTH_CANCELLED') {
      dialog.showErrorBox('XinT Codex Account Switcher', error.message || String(error));
    }
    throw error;
  }
}

async function importAuthJsonWithPicker() {
  const result = await dialog.showOpenDialog({
    title: '选择 auth.json',
    properties: ['openFile'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  let auth;

  try {
    auth = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    throw new Error('选中的文件不是有效的 auth.json。');
  }

  if (!auth || typeof auth !== 'object' || (!auth.OPENAI_API_KEY && !auth.tokens)) {
    throw new Error('auth.json 缺少可识别的认证字段。');
  }

  const identity = auth.tokens?.access_token
    ? parseChatGptIdentity(auth)
    : { accountId: null, email: null };
  const profileBaseId = identity.accountId ?? identity.email ?? path.parse(filePath).name;

  const created = await createProfileFromAuth({
    codexHome,
    profilesRoot: getProfilesRoot(),
    profileIdBase: profileBaseId,
    auth,
    name: identity.email ?? identity.accountId ?? profileBaseId,
    trackedFiles: getActiveTrackedFiles()
  });

  return created;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    backgroundColor: '#09111f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && appSettingsCache.closeBehavior === 'background') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('state:load', () => withErrorDialog(buildState));

ipcMain.handle('state:refresh-usage', (_, payload) => withErrorDialog(() => refreshUsageState({
  force: payload?.force === true
})));

ipcMain.handle('profile:create', async (_, payload) => {
  return withErrorDialog(async () => {
    await createProfileFromCurrent({
      codexHome,
      profilesRoot: getProfilesRoot(),
      name: payload?.name,
      trackedFiles: getActiveTrackedFiles()
    });
    currentUsageCache = null;
    return buildState();
  });
});

ipcMain.handle('profile:create-oauth', async () => {
  return withErrorDialog(async () => {
    if (activeOAuthFlow) {
      throw new Error('当前已有一个网页授权流程正在进行。');
    }

    const clientId = await resolveOAuthClientId();
    activeOAuthFlow = createDesktopOAuthFlow({
      clientId,
      openExternal: (url) => shell.openExternal(url)
    });

    try {
      const oauthTokens = await activeOAuthFlow.promise;
      const auth = buildChatGptAuthRecord(oauthTokens);
      const profileBaseId = auth.tokens.account_id ?? `oauth-${Date.now()}`;

      const created = await createProfileFromAuth({
        codexHome,
        profilesRoot: getProfilesRoot(),
        profileIdBase: profileBaseId,
        auth,
        name: profileBaseId,
        trackedFiles: getActiveTrackedFiles()
      });

      return {
        ...(await buildState()),
        lastAction: {
          type: 'oauth-create',
          profileId: created.id
        }
      };
    } finally {
      activeOAuthFlow = null;
    }
  });
});

ipcMain.handle('profile:cancel-oauth', async () => {
  if (!activeOAuthFlow) {
    return { cancelled: false };
  }

  activeOAuthFlow.cancel();
  return { cancelled: true };
});

ipcMain.handle('profile:import-auth', async () => {
  return withErrorDialog(async () => {
    const created = await importAuthJsonWithPicker();
    if (!created) {
      return {
        ...(await buildState()),
        lastAction: {
          type: 'import-cancelled'
        }
      };
    }

    currentUsageCache = null;
    return {
      ...(await buildState()),
      lastAction: {
        type: 'import-auth',
        profileId: created.id
      }
    };
  });
});

ipcMain.handle('profile:rename', async (_, payload) => {
  return withErrorDialog(async () => {
    await renameProfile({
      profilesRoot: getProfilesRoot(),
      profileId: payload.profileId,
      newName: payload.newName
    });
    return buildState();
  });
});

ipcMain.handle('profile:reorder', async (_, payload) => {
  return withErrorDialog(async () => {
    await reorderProfiles({
      profilesRoot: getProfilesRoot(),
      profileIds: payload.profileIds
    });
    return buildState();
  });
});

ipcMain.handle('profile:delete', async (_, payload) => {
  return withErrorDialog(async () => {
    await deleteProfile({
      profilesRoot: getProfilesRoot(),
      profileId: payload.profileId
    });
    return buildState();
  });
});

ipcMain.handle('profile:export-auth', async (_, payload) => {
  return withErrorDialog(async () => {
    const profileId = String(payload?.profileId || '').trim();
    const profileName = String(payload?.profileName || profileId || 'auth').trim();
    if (!profileId) {
      throw new Error('缺少档案 ID。');
    }

    const snapshotAuthPath = path.join(getProfileSnapshotDir(getProfilesRoot(), profileId), 'auth.json');
    try {
      await fs.access(snapshotAuthPath);
    } catch {
      throw new Error('该档案没有可导出的 auth.json。');
    }

    const safeName = profileName.replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').slice(0, 80) || 'auth';
    const result = await dialog.showSaveDialog({
      title: '导出 auth.json',
      defaultPath: `${safeName}-auth.json`,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return {
        cancelled: true
      };
    }

    await fs.copyFile(snapshotAuthPath, result.filePath);
    return {
      cancelled: false,
      filePath: result.filePath
    };
  });
});

ipcMain.handle('profile:apply', async (_, payload) => {
  return withErrorDialog(async () => {
    await stopCodexProcesses();
    invalidateRuntimeSummaryCache();
    const result = await applyProfile({
      codexHome,
      profilesRoot: getProfilesRoot(),
      backupsRoot: getBackupsRoot(),
      profileId: payload.profileId,
      trackedFiles: getActiveTrackedFiles()
    });

    if (payload.relaunch !== false) {
      await launchCodex();
    }
    currentUsageCache = null;
    invalidateRuntimeSummaryCache();

    return {
      ...(await buildState()),
      lastAction: {
        type: 'apply',
        profileName: result.profile.name,
        backupDir: result.backupDir
      }
    };
  });
});

ipcMain.handle('codex:restart', async () => {
  return withErrorDialog(async () => {
    await stopCodexProcesses();
    await launchCodex();
    invalidateRuntimeSummaryCache();
    return buildState();
  });
});

ipcMain.handle('folder:open-profiles', async () => {
  await shell.openPath(getProfilesRoot());
});

ipcMain.handle('folder:open-user-data', async () => {
  await shell.openPath(getEffectiveAppDataPath());
});

ipcMain.handle('folder:choose-app-data', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择应用数据存储位置',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('shell:open-external', async (_, payload) => {
  const url = String(payload?.url || '');
  if (!/^https:\/\//i.test(url)) {
    throw new Error('只能打开 HTTPS 链接。');
  }
  await shell.openExternal(url);
});

ipcMain.handle('settings:save', async (_, payload) => {
  return withErrorDialog(async () => {
    const previousSettings = appSettingsCache;
    appSettingsCache = await writeAppSettings(getUserDataPath(), payload?.settings);
    app.setLoginItemSettings({
      openAtLogin: appSettingsCache.launchAtStartup
    });

    const requiresProfileReload = previousSettings.appDataPath !== appSettingsCache.appDataPath
      || previousSettings.configTomlMode !== appSettingsCache.configTomlMode;

    if (!requiresProfileReload) {
      const cached = updateCachedSettingsState(appSettingsCache);
      if (cached) {
        return cached;
      }
    }

    currentUsageCache = null;
    return buildState();
  });
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await loadAppSettings();
  app.setLoginItemSettings({
    openAtLogin: appSettingsCache.launchAtStartup
  });
  createMainWindow();

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      return;
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
