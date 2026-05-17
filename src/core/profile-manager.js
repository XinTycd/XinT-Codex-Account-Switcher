'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  getAuthIdentity,
  maskSecret,
  readAuthFile,
  writeAuthFile
} = require('./auth-store');

const TRACKED_FILES = [
  'auth.json',
  '.codex-global-state.json',
  'config.toml',
  'installation_id',
  'cap_sid'
];

function slugifyName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildDefaultProfileName(summary) {
  const anchor = summary.email ?? summary.accountId ?? summary.userId ?? summary.planType ?? null;
  if (anchor) {
    return String(anchor).trim();
  }

  return `profile-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(jsonPath) {
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function safeReadFile(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function computeFingerprint(dirPath, trackedFiles = TRACKED_FILES) {
  const hash = crypto.createHash('sha256');
  const contents = await Promise.all(
    trackedFiles.map((relativePath) => safeReadFile(path.join(dirPath, relativePath)))
  );

  trackedFiles.forEach((relativePath, index) => {
    hash.update(`FILE:${relativePath}\n`);
    const content = contents[index];
    if (content) {
      hash.update(content);
    } else {
      hash.update('MISSING');
    }
    hash.update('\n');
  });

  return hash.digest('hex');
}

async function summarizeState(codexHome, { trackedFiles = TRACKED_FILES } = {}) {
  const auth = await readAuthFile(codexHome);
  const fingerprint = await computeFingerprint(codexHome, trackedFiles);
  const identity = getAuthIdentity(auth);

  return {
    authMode: auth?.auth_mode ?? null,
    lastRefresh: auth?.last_refresh ?? null,
    apiKeyMasked: maskSecret(auth?.OPENAI_API_KEY),
    tokenKeys: auth?.tokens ? Object.keys(auth.tokens) : [],
    fingerprint,
    identityKey: identity.identityKey,
    accountId: identity.accountId,
    userId: identity.userId,
    email: identity.email,
    planType: identity.planType
  };
}

async function listProfiles(profilesRoot, codexHome, { trackedFiles = TRACKED_FILES } = {}) {
  await ensureDir(profilesRoot);

  const current = await summarizeState(codexHome, { trackedFiles });
  const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
  const profileReads = entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const profileDir = path.join(profilesRoot, entry.name);
    const metadata = await readJson(path.join(profileDir, 'metadata.json'));
    if (!metadata) {
      return null;
    }

    return {
      ...metadata,
      id: entry.name,
      sortOrder: Number.isFinite(metadata.sortOrder) ? metadata.sortOrder : Number.MAX_SAFE_INTEGER,
      isActive: metadata.identityKey != null && metadata.identityKey === current.identityKey
    };
  });
  const profiles = (await Promise.all(profileReads)).filter(Boolean);

  profiles.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    current,
    profiles
  };
}

async function createUniqueProfileId(profilesRoot, name) {
  const base = slugifyName(name) || `profile-${Date.now()}`;
  let candidate = base;
  let counter = 2;

  while (await pathExists(path.join(profilesRoot, candidate))) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

async function copyTrackedFiles(sourceDir, targetDir, { trackedFiles = TRACKED_FILES } = {}) {
  await ensureDir(targetDir);

  await Promise.all(trackedFiles.map(async (relativePath) => {
    const fromPath = path.join(sourceDir, relativePath);
    const toPath = path.join(targetDir, relativePath);
    const exists = await pathExists(fromPath);

    if (exists) {
      await ensureDir(path.dirname(toPath));
      await fs.copyFile(fromPath, toPath);
    } else if (await pathExists(toPath)) {
      await fs.rm(toPath, { force: true });
    }
  }));
}

async function saveProfileMetadata(profileDir, metadata) {
  await fs.writeFile(
    path.join(profileDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  );
}

function buildMetadataFromSummary({ id, name, summary, previousMetadata = null }) {
  const now = new Date().toISOString();

  return {
    id,
    name,
    createdAt: previousMetadata?.createdAt ?? now,
    updatedAt: now,
    sortOrder: Number.isFinite(previousMetadata?.sortOrder) ? previousMetadata.sortOrder : 0,
    authMode: summary.authMode,
    lastRefresh: summary.lastRefresh,
    apiKeyMasked: summary.apiKeyMasked,
    tokenKeys: summary.tokenKeys,
    fingerprint: summary.fingerprint,
    identityKey: summary.identityKey,
    accountId: summary.accountId,
    userId: summary.userId,
    email: summary.email,
    planType: summary.planType,
    usage: previousMetadata?.usage ?? null,
    usageError: previousMetadata?.usageError ?? null,
    usageUpdatedAt: previousMetadata?.usageUpdatedAt ?? null
  };
}

async function createProfileFromCurrent({ codexHome, profilesRoot, name, trackedFiles = TRACKED_FILES }) {
  const currentSummary = await summarizeState(codexHome, { trackedFiles });
  if (!currentSummary.authMode && !currentSummary.apiKeyMasked && currentSummary.tokenKeys.length === 0) {
    throw new Error('当前 Codex 尚未检测到可保存的登录状态。请先在 Codex 里登录目标账号。');
  }
  const trimmedName = (name || '').trim() || buildDefaultProfileName(currentSummary);

  await ensureDir(profilesRoot);

  const id = await createUniqueProfileId(profilesRoot, trimmedName);
  const profileDir = path.join(profilesRoot, id);
  const snapshotDir = path.join(profileDir, 'snapshot');

  await copyTrackedFiles(codexHome, snapshotDir, { trackedFiles });

  const summary = await summarizeState(snapshotDir, { trackedFiles });
  const existingState = await listProfiles(profilesRoot, codexHome, { trackedFiles });
  const metadata = buildMetadataFromSummary({
    id,
    name: trimmedName,
    summary,
    previousMetadata: {
      sortOrder: existingState.profiles.length
    }
  });

  await saveProfileMetadata(profileDir, metadata);
  return metadata;
}

async function createProfileFromAuth({
  codexHome,
  profilesRoot,
  profileIdBase,
  auth,
  name,
  trackedFiles = TRACKED_FILES
}) {
  await ensureDir(profilesRoot);

  const id = await createUniqueProfileId(profilesRoot, profileIdBase);
  const profileDir = path.join(profilesRoot, id);
  const snapshotDir = path.join(profileDir, 'snapshot');

  await copyTrackedFiles(codexHome, snapshotDir, { trackedFiles });
  await writeAuthFile(snapshotDir, auth);

  const summary = await summarizeState(snapshotDir, { trackedFiles });
  const existingState = await listProfiles(profilesRoot, codexHome, { trackedFiles });
  const metadata = buildMetadataFromSummary({
    id,
    name: name ?? id,
    summary,
    previousMetadata: {
      sortOrder: existingState.profiles.length
    }
  });

  await saveProfileMetadata(profileDir, metadata);
  return metadata;
}

async function backupCurrentState({ codexHome, backupsRoot, trackedFiles = TRACKED_FILES }) {
  await ensureDir(backupsRoot);
  const backupId = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupsRoot, backupId);
  await copyTrackedFiles(codexHome, backupDir, { trackedFiles });
  return backupDir;
}

async function applyProfile({
  codexHome,
  profilesRoot,
  backupsRoot,
  profileId,
  trackedFiles = TRACKED_FILES
}) {
  const profileDir = path.join(profilesRoot, profileId);
  const snapshotDir = path.join(profileDir, 'snapshot');
  const metadataPath = path.join(profileDir, 'metadata.json');
  const metadata = await readJson(metadataPath);

  if (!metadata || !(await pathExists(snapshotDir))) {
    throw new Error('目标档案不存在。');
  }

  const backupDir = await backupCurrentState({ codexHome, backupsRoot, trackedFiles });
  await copyTrackedFiles(snapshotDir, codexHome, { trackedFiles });

  const refreshed = await summarizeState(snapshotDir, { trackedFiles });
  const updatedMetadata = buildMetadataFromSummary({
    id: profileId,
    name: metadata.name,
    summary: refreshed,
    previousMetadata: metadata
  });

  await saveProfileMetadata(profileDir, updatedMetadata);

  return {
    profile: updatedMetadata,
    backupDir
  };
}

async function renameProfile({ profilesRoot, profileId, newName }) {
  const trimmedName = (newName || '').trim();
  if (!trimmedName) {
    throw new Error('新档案名不能为空。');
  }

  const profileDir = path.join(profilesRoot, profileId);
  const metadataPath = path.join(profileDir, 'metadata.json');
  const metadata = await readJson(metadataPath);
  if (!metadata) {
    throw new Error('目标档案不存在。');
  }

  const updated = {
    ...metadata,
    id: profileId,
    name: trimmedName,
    updatedAt: new Date().toISOString()
  };

  await saveProfileMetadata(profileDir, updated);
  return updated;
}

async function reorderProfiles({ profilesRoot, profileIds }) {
  const normalizedIds = Array.isArray(profileIds)
    ? profileIds.filter((profileId) => typeof profileId === 'string' && profileId.trim())
    : [];
  if (!normalizedIds.length) {
    throw new Error('排序列表不能为空。');
  }

  const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
  const knownIds = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));

  for (const profileId of normalizedIds) {
    if (!knownIds.has(profileId)) {
      throw new Error(`档案不存在：${profileId}`);
    }
  }

  const remainingIds = [...knownIds].filter((profileId) => !normalizedIds.includes(profileId));
  const orderedIds = [...normalizedIds, ...remainingIds];

  await Promise.all(
    orderedIds.map(async (profileId, index) => {
      const profileDir = path.join(profilesRoot, profileId);
      const metadataPath = path.join(profileDir, 'metadata.json');
      const metadata = await readJson(metadataPath);
      if (!metadata) {
        return;
      }

      await saveProfileMetadata(profileDir, {
        ...metadata,
        sortOrder: index
      });
    })
  );
}

async function deleteProfile({ profilesRoot, profileId }) {
  const profileDir = path.join(profilesRoot, profileId);
  if (!(await pathExists(profileDir))) {
    throw new Error('目标档案不存在。');
  }

  await fs.rm(profileDir, { recursive: true, force: true });
}

function getProfileDir(profilesRoot, profileId) {
  return path.join(profilesRoot, profileId);
}

function getProfileSnapshotDir(profilesRoot, profileId) {
  return path.join(getProfileDir(profilesRoot, profileId), 'snapshot');
}

async function updateProfileMetadata({ profilesRoot, profileId, mutate }) {
  const profileDir = getProfileDir(profilesRoot, profileId);
  const metadataPath = path.join(profileDir, 'metadata.json');
  const metadata = await readJson(metadataPath);
  if (!metadata) {
    throw new Error('目标档案不存在。');
  }

  const mutated = await mutate(metadata, profileDir);
  const updated = {
    ...mutated,
    id: profileId
  };
  await saveProfileMetadata(profileDir, updated);
  return updated;
}

module.exports = {
  TRACKED_FILES,
  applyProfile,
  backupCurrentState,
  buildDefaultProfileName,
  createProfileFromAuth,
  createProfileFromCurrent,
  deleteProfile,
  getProfileDir,
  getProfileSnapshotDir,
  listProfiles,
  reorderProfiles,
  renameProfile,
  summarizeState,
  updateProfileMetadata
};
