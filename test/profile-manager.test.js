'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  applyProfile,
  createProfileFromCurrent,
  listProfiles,
  reorderProfiles,
  renameProfile
} = require('../src/core/profile-manager');
const { enrichProfiles } = require('../src/core/profile-usage');

async function makeTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-switcher-'));
  const codexHome = path.join(root, '.codex');
  const profilesRoot = path.join(root, 'profiles');
  const backupsRoot = path.join(root, 'backups');

  await fs.mkdir(codexHome, { recursive: true });
  await fs.mkdir(profilesRoot, { recursive: true });
  await fs.mkdir(backupsRoot, { recursive: true });

  return {
    root,
    codexHome,
    profilesRoot,
    backupsRoot
  };
}

async function writeState(codexHome, suffix) {
  await fs.writeFile(
    path.join(codexHome, 'auth.json'),
    JSON.stringify(
      {
        auth_mode: 'api_key',
        last_refresh: `2026-05-15T0${suffix}:00:00.000Z`,
        OPENAI_API_KEY: `sk-test-${suffix}-secret`,
        tokens: {
          primary: `token-${suffix}`
        }
      },
      null,
      2
    ),
    'utf8'
  );
  await fs.writeFile(path.join(codexHome, '.codex-global-state.json'), JSON.stringify({ suffix }), 'utf8');
  await fs.writeFile(path.join(codexHome, 'config.toml'), `model = "gpt-${suffix}"\n`, 'utf8');
  await fs.writeFile(path.join(codexHome, 'installation_id'), `install-${suffix}`, 'utf8');
  await fs.writeFile(path.join(codexHome, 'cap_sid'), `cap-${suffix}`, 'utf8');
}

test('create and list profiles from current state', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '1');

  const created = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '工作号'
  });

  assert.equal(created.name, '工作号');

  const listed = await listProfiles(dirs.profilesRoot, dirs.codexHome);
  assert.equal(listed.profiles.length, 1);
  assert.equal(listed.profiles[0].isActive, true);
  assert.equal(listed.current.authMode, 'api_key');
});

test('create profile from current state can auto-generate a name', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '4');

  const created = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot
  });

  assert.ok(created.name);
  assert.ok(created.id);
});

test('apply profile restores snapshot and writes backup', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '1');
  const created = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '账号 A'
  });

  await writeState(dirs.codexHome, '2');

  const result = await applyProfile({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    backupsRoot: dirs.backupsRoot,
    profileId: created.id
  });

  const auth = JSON.parse(await fs.readFile(path.join(dirs.codexHome, 'auth.json'), 'utf8'));
  assert.equal(auth.OPENAI_API_KEY, 'sk-test-1-secret');
  assert.equal(result.profile.id, created.id);

  const backups = await fs.readdir(dirs.backupsRoot);
  assert.equal(backups.length, 1);
});

test('rename profile updates stored metadata', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '3');
  const created = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '旧名称'
  });

  const updated = await renameProfile({
    profilesRoot: dirs.profilesRoot,
    profileId: created.id,
    newName: '新名称'
  });

  assert.equal(updated.name, '新名称');
});

test('reorder and rename preserve manual profile ordering', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '5');
  const first = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '账号一'
  });

  await writeState(dirs.codexHome, '6');
  const second = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '账号二'
  });

  await reorderProfiles({
    profilesRoot: dirs.profilesRoot,
    profileIds: [second.id, first.id]
  });

  await renameProfile({
    profilesRoot: dirs.profilesRoot,
    profileId: first.id,
    newName: '账号一-重命名'
  });

  const listed = await listProfiles(dirs.profilesRoot, dirs.codexHome);
  assert.deepEqual(
    listed.profiles.map((profile) => profile.id),
    [second.id, first.id]
  );
});

test('failed usage refresh preserves previous cached usage', async () => {
  const dirs = await makeTempWorkspace();
  await writeState(dirs.codexHome, '7');
  const created = await createProfileFromCurrent({
    codexHome: dirs.codexHome,
    profilesRoot: dirs.profilesRoot,
    name: '额度缓存'
  });

  const profileDir = path.join(dirs.profilesRoot, created.id);
  const metadataPath = path.join(profileDir, 'metadata.json');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  metadata.usage = {
    fiveHour: { remainingPercent: 61 },
    weekly: { remainingPercent: 88 }
  };
  metadata.usageUpdatedAt = '2026-05-16T00:00:00.000Z';
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

  const listed = await listProfiles(dirs.profilesRoot, dirs.codexHome);
  const refreshed = await enrichProfiles(dirs.profilesRoot, listed.profiles);

  assert.equal(refreshed[0].usage.fiveHour.remainingPercent, 61);
  assert.equal(refreshed[0].usage.weekly.remainingPercent, 88);
});
