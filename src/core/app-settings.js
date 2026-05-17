'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_APP_SETTINGS = {
  language: 'zh-CN',
  launchAtStartup: false,
  darkMode: false,
  closeBehavior: 'quit',
  appDataPath: '',
  configTomlMode: 'per-account'
};

const SUPPORTED_LANGUAGES = new Set([
  'zh-CN',
  'zh-TW',
  'en-US',
  'fr-FR',
  'de-DE',
  'ja-JP',
  'ko-KR'
]);

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSettings(settings = {}) {
  return {
    language: SUPPORTED_LANGUAGES.has(settings.language)
      ? settings.language
      : DEFAULT_APP_SETTINGS.language,
    launchAtStartup: normalizeBoolean(
      settings.launchAtStartup,
      DEFAULT_APP_SETTINGS.launchAtStartup
    ),
    darkMode: normalizeBoolean(settings.darkMode, DEFAULT_APP_SETTINGS.darkMode),
    closeBehavior: settings.closeBehavior === 'background'
      ? 'background'
      : DEFAULT_APP_SETTINGS.closeBehavior,
    appDataPath: typeof settings.appDataPath === 'string' && path.isAbsolute(settings.appDataPath)
      ? settings.appDataPath
      : DEFAULT_APP_SETTINGS.appDataPath,
    configTomlMode: settings.configTomlMode === 'shared'
      ? 'shared'
      : DEFAULT_APP_SETTINGS.configTomlMode
  };
}

function getSettingsPath(userDataPath) {
  return path.join(userDataPath, 'app-settings.json');
}

async function readAppSettings(userDataPath) {
  try {
    const raw = await fs.readFile(getSettingsPath(userDataPath), 'utf8');
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

async function writeAppSettings(userDataPath, settings) {
  const normalized = normalizeSettings(settings);
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(
    getSettingsPath(userDataPath),
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8'
  );
  return normalized;
}

function getTrackedFilesForSettings(settings, trackedFiles) {
  const normalized = normalizeSettings(settings);
  if (normalized.configTomlMode !== 'shared') {
    return trackedFiles;
  }

  return trackedFiles.filter((trackedFile) => trackedFile !== 'config.toml');
}

module.exports = {
  DEFAULT_APP_SETTINGS,
  getTrackedFilesForSettings,
  normalizeSettings,
  readAppSettings,
  writeAppSettings
};
