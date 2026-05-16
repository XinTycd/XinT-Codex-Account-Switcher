'use strict';

const {
  fetchChatGptUsage,
  readAuthFile,
  refreshChatGptAuth,
  writeAuthFile
} = require('./auth-store');
const {
  getProfileSnapshotDir,
  summarizeState,
  updateProfileMetadata
} = require('./profile-manager');
const { summarizeUsage } = require('./rate-limits');

const USAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const USAGE_REFRESH_CONCURRENCY = 2;

function hasFreshUsage(metadata, ttlMs = USAGE_CACHE_TTL_MS) {
  if (!metadata?.usageUpdatedAt) {
    return false;
  }

  const usageUpdatedAtMs = new Date(metadata.usageUpdatedAt).getTime();
  if (!Number.isFinite(usageUpdatedAtMs)) {
    return false;
  }

  return Date.now() - usageUpdatedAtMs < ttlMs;
}

async function refreshAuthAndUsage(codexHome, { persistAuth = false } = {}) {
  let auth = await readAuthFile(codexHome);
  if (!auth) {
    return {
      auth: null,
      usage: null,
      usageError: '未找到 auth.json。',
      summary: await summarizeState(codexHome)
    };
  }

  try {
    if (auth.auth_mode === 'chatgpt' && auth?.tokens?.refresh_token) {
      auth = await refreshChatGptAuth(auth);
      if (persistAuth) {
        await writeAuthFile(codexHome, auth);
      }
    }
  } catch (error) {
    return {
      auth,
      usage: null,
      usageError: error.message,
      summary: await summarizeState(codexHome)
    };
  }

  let usage = null;
  let usageError = null;

  try {
    if (auth.auth_mode === 'chatgpt' && auth?.tokens?.access_token) {
      const usagePayload = await fetchChatGptUsage(auth.tokens.access_token);
      usage = summarizeUsage(usagePayload);
    }
  } catch (error) {
    usageError = error.message;
  }

  return {
    auth,
    usage,
    usageError,
    summary: await summarizeState(codexHome)
  };
}

async function enrichCurrentState(codexHome) {
  const result = await refreshAuthAndUsage(codexHome, { persistAuth: true });
  return {
    ...result.summary,
    usage: result.usage,
    usageError: result.usageError
  };
}

async function enrichProfile(profilesRoot, profile, { force = false } = {}) {
  const snapshotDir = getProfileSnapshotDir(profilesRoot, profile.id);
  if (!force && hasFreshUsage(profile)) {
    return profile;
  }
  const result = await refreshAuthAndUsage(snapshotDir, { persistAuth: true });

  return updateProfileMetadata({
    profilesRoot,
    profileId: profile.id,
    mutate: (metadata) => ({
      ...metadata,
      ...result.summary,
      updatedAt: metadata.updatedAt,
      usage: result.usage ?? metadata.usage ?? null,
      usageError: result.usageError,
      usageUpdatedAt: result.usage
        ? new Date().toISOString()
        : (metadata.usageUpdatedAt ?? null)
    })
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function enrichProfiles(profilesRoot, profiles, {
  force = false,
  ttlMs = USAGE_CACHE_TTL_MS,
  concurrency = USAGE_REFRESH_CONCURRENCY
} = {}) {
  const targets = force
    ? profiles
    : profiles.filter((profile) => !hasFreshUsage(profile, ttlMs));
  if (!targets.length) {
    return profiles;
  }

  const refreshed = await mapWithConcurrency(
    targets,
    concurrency,
    (profile) => enrichProfile(profilesRoot, profile, { force })
  );
  const refreshedById = new Map(refreshed.map((profile) => [profile.id, profile]));

  return profiles.map((profile) => refreshedById.get(profile.id) ?? profile);
}

module.exports = {
  enrichCurrentState,
  enrichProfiles,
  hasFreshUsage,
  refreshAuthAndUsage
};
