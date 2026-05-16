'use strict';

const state = {
  busy: false,
  busyMode: null,
  data: null,
  addMethod: 'oauth',
  theme: 'light',
  draggingProfileId: null,
  refreshingUsage: false,
  refreshRequestId: 0,
  activeFlashMessage: '',
  flashQueue: []
};

const currentStateEl = document.getElementById('currentState');
const profilesEl = document.getElementById('profiles');
const flashEl = document.getElementById('flash');
const flashTextEl = document.getElementById('flashText');
const flashCloseBtnEl = document.getElementById('flashCloseBtn');
const runtimeBadgeEl = document.getElementById('runtimeBadge');
const themeToggleBtnEl = document.getElementById('themeToggleBtn');
const statusBtnEl = document.getElementById('statusBtn');
const restartCodexBtnEl = document.getElementById('restartCodexBtn');
const openProfilesBtnEl = document.getElementById('openProfilesBtn');
const refreshUsageBtnEl = document.getElementById('refreshUsageBtn');
const addAccountBtnEl = document.getElementById('addAccountBtn');
const profileCardTemplate = document.getElementById('profileCardTemplate');
const renameModalEl = document.getElementById('renameModal');
const renameFormEl = document.getElementById('renameForm');
const renameInputEl = document.getElementById('renameInput');
const addAccountModalEl = document.getElementById('addAccountModal');
const addMethodTitleEl = document.getElementById('addMethodTitle');
const addMethodDescriptionEl = document.getElementById('addMethodDescription');
const addMethodNoteEl = document.getElementById('addMethodNote');
const addMethodActionBtnEl = document.getElementById('addMethodActionBtn');
const currentStateModalEl = document.getElementById('currentStateModal');
const oauthPendingModalEl = document.getElementById('oauthPendingModal');
const cancelOAuthBtnEl = document.getElementById('cancelOAuthBtn');
const THEME_STORAGE_KEY = 'xint-codex-switcher-theme';
const AUTO_REFRESH_INTERVAL_MS = 30 * 1000;

const addMethodConfig = {
  oauth: {
    title: '网页 OAuth 授权登录',
    description: '打开浏览器进入官方登录页。你完成授权后，切换器会自动接收回调并创建一个新的账号档案。',
    note: '适合直接添加全新的 ChatGPT / Codex 账号。授权等待期间会显示单独的状态弹窗，并允许你主动取消。',
    actionLabel: '开始网页授权'
  },
  current: {
    title: '保存当前 Codex 已登录档案',
    description: '直接读取本机当前 `~/.codex` 下的认证状态，把已经登录好的账号保存成新档案。',
    note: '适合你已经在 Codex 客户端里完成登录，只需要把当前状态沉淀为一个可切换档案的场景。',
    actionLabel: '保存当前登录'
  },
  'import-auth': {
    title: '导入 auth.json',
    description: '选择外部 `auth.json` 文件，切换器会解析认证信息并导入为新的账号档案。',
    note: '适合跨机器迁移账号、恢复备份，或者把其他环境里的认证状态拉进当前切换器。',
    actionLabel: '选择 auth.json'
  }
};

function setBusy(busy, busyMode = null) {
  state.busy = busy;
  state.busyMode = busy ? busyMode : null;
  document.querySelectorAll('button').forEach((button) => {
    button.disabled = busy && button.dataset.allowBusy !== 'true';
  });
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem(THEME_STORAGE_KEY, state.theme);

  if (themeToggleBtnEl) {
    const nextLabel = state.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    themeToggleBtnEl.setAttribute('aria-label', nextLabel);
    themeToggleBtnEl.setAttribute('title', nextLabel);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function renderFlashMessage(message) {
  if (!message) {
    flashEl.classList.add('hidden');
    flashTextEl.textContent = '';
    return;
  }

  state.activeFlashMessage = message;
  flashTextEl.textContent = message;
  flashEl.classList.remove('hidden');
}

function dismissFlash() {
  if (state.flashQueue.length) {
    renderFlashMessage(state.flashQueue.shift());
    return;
  }

  state.activeFlashMessage = '';
  flashEl.classList.add('hidden');
  flashTextEl.textContent = '';
}

function showFlash(message, { replace = false, clearQueue = false } = {}) {
  if (!message) {
    if (clearQueue) {
      state.flashQueue = [];
    }
    dismissFlash();
    return;
  }

  if (clearQueue) {
    state.flashQueue = [];
  }

  if (replace || !state.activeFlashMessage) {
    renderFlashMessage(message);
    return;
  }

  state.flashQueue.push(message);
}

function formatResetTime(quota) {
  if (!quota?.resetsAt) {
    return '未提供';
  }

  const resetDate = new Date(quota.resetsAt * 1000);
  if (quota.windowMinutes && quota.windowMinutes < 24 * 60) {
    return resetDate.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  return resetDate.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatQuota(quota) {
  if (!quota) {
    return '<strong>--%</strong><span>剩余</span>';
  }

  return `<strong>${Math.round(quota.remainingPercent)}%</strong><span>剩余</span>`;
}

function formatQuotaReset(quota) {
  return `
    <span class="quota-reset-label">重置时间</span>
    <span class="quota-reset-value">${formatResetTime(quota)}</span>
  `;
}

function formatPlanType(planType) {
  if (!planType) {
    return 'Unknown';
  }

  const normalized = String(planType).replace(/[_-]+/g, ' ').trim();
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isFreePlan(planType) {
  return String(planType || '').trim().toLowerCase() === 'free';
}

function renderMetric(label, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'metric';
  wrapper.innerHTML = `
    <div class="metric-label">${label}</div>
    <div class="metric-value">${value || '未检测到'}</div>
  `;
  return wrapper;
}

function renderCurrentState(data) {
  currentStateEl.innerHTML = '';

  const metrics = [
    renderMetric('Codex 目录', data.codexHome),
    renderMetric('认证模式', data.current.authMode || '未知'),
    renderMetric('当前账号 ID', data.current.accountId || data.current.email || '未检测到'),
    renderMetric('当前套餐', formatPlanType(data.current.planType))
  ];

  if (!isFreePlan(data.current.planType)) {
    metrics.push(
      renderMetric('当前 5 小时额度', `${Math.round(data.current.usage?.fiveHour?.remainingPercent ?? 0)}% 剩余`)
    );
  }

  metrics.push(
    renderMetric('当前一周额度', `${Math.round(data.current.usage?.weekly?.remainingPercent ?? 0)}% 剩余`)
  );

  currentStateEl.append(...metrics);

  runtimeBadgeEl.classList.toggle('running', Boolean(data.runtime.runningCount));
  runtimeBadgeEl.classList.toggle('stopped', !data.runtime.runningCount);
  runtimeBadgeEl.textContent = data.runtime.runningCount
    ? 'Codex 正在运行'
    : 'Codex 当前未运行';
}

function renderAddMethod() {
  const config = addMethodConfig[state.addMethod];
  addMethodTitleEl.textContent = config.title;
  addMethodDescriptionEl.textContent = config.description;
  addMethodNoteEl.textContent = config.note;
  addMethodActionBtnEl.textContent = config.actionLabel;

  addAccountModalEl.querySelectorAll('[data-add-method-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.addMethodTab === state.addMethod);
  });
}

function renderEmptyProfiles() {
  const empty = document.createElement('div');
  empty.className = 'profile-card';
  empty.innerHTML = `
    <div class="profile-head">
      <div class="profile-title-row">
        <div class="profile-name">还没有账号档案</div>
      </div>
    </div>
    <div class="profile-meta">点击右上角加号，可以通过网页 OAuth、保存当前 Codex 登录状态，或导入 auth.json 来添加账号。</div>
  `;
  profilesEl.append(empty);
}

function renderProfiles(data) {
  profilesEl.innerHTML = '';

  if (!data.profiles.length) {
    renderEmptyProfiles();
    return;
  }

  for (const profile of data.profiles) {
    const fragment = profileCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.profile-card');
    const nameEl = fragment.querySelector('.profile-name');
    const planBadgeEl = fragment.querySelector('.plan-badge');
    const metaEl = fragment.querySelector('.profile-meta');
    const statusDotEl = fragment.querySelector('.status-dot');
    const quotaGridEl = fragment.querySelector('.quota-grid');
    const fiveHourBlockEl = fragment.querySelector('[data-quota-block="five-hour"]');
    const fiveHourEl = fragment.querySelector('[data-quota="five-hour"]');
    const weeklyEl = fragment.querySelector('[data-quota="weekly"]');
    const fiveHourBarEl = fragment.querySelector('[data-quota-bar="five-hour"]');
    const weeklyBarEl = fragment.querySelector('[data-quota-bar="weekly"]');
    const fiveHourResetEl = fragment.querySelector('[data-quota-reset="five-hour"]');
    const weeklyResetEl = fragment.querySelector('[data-quota-reset="weekly"]');
    const applyBtn = fragment.querySelector('[data-action="apply"]');
    const renameBtn = fragment.querySelector('[data-action="rename"]');
    const deleteBtn = fragment.querySelector('[data-action="delete"]');

    card.dataset.profileId = profile.id;
    card.draggable = true;
    nameEl.textContent = profile.name || profile.id;
    planBadgeEl.textContent = formatPlanType(profile.planType);

    if (isFreePlan(profile.planType)) {
      fiveHourBlockEl.classList.add('hidden');
      quotaGridEl.classList.add('single');
    }

    fiveHourEl.innerHTML = formatQuota(profile.usage?.fiveHour);
    weeklyEl.innerHTML = formatQuota(profile.usage?.weekly);
    fiveHourBarEl.style.width = `${Math.max(0, Math.min(100, profile.usage?.fiveHour?.remainingPercent ?? 0))}%`;
    weeklyBarEl.style.width = `${Math.max(0, Math.min(100, profile.usage?.weekly?.remainingPercent ?? 0))}%`;
    fiveHourResetEl.innerHTML = formatQuotaReset(profile.usage?.fiveHour);
    weeklyResetEl.innerHTML = formatQuotaReset(profile.usage?.weekly);
    metaEl.textContent = profile.usageError
      ? `额度读取失败：${profile.usageError}`
      : '';

    if (profile.isActive) {
      statusDotEl.classList.add('active');
      applyBtn.textContent = '当前已激活';
      applyBtn.disabled = true;
    }

    card.addEventListener('dragstart', (event) => {
      if (state.busy) {
        event.preventDefault();
        return;
      }

      state.draggingProfileId = profile.id;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', profile.id);
    });

    card.addEventListener('dragend', () => {
      state.draggingProfileId = null;
      profilesEl.querySelectorAll('.profile-card').forEach((profileCard) => {
        profileCard.classList.remove('dragging', 'drag-over');
      });
    });

    card.addEventListener('dragover', (event) => {
      if (!state.draggingProfileId || state.draggingProfileId === profile.id) {
        return;
      }

      event.preventDefault();
      card.classList.add('drag-over');
      event.dataTransfer.dropEffect = 'move';
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');

      const draggedProfileId = state.draggingProfileId || event.dataTransfer.getData('text/plain');
      if (!draggedProfileId || draggedProfileId === profile.id) {
        return;
      }

      const currentIds = state.data.profiles.map((item) => item.id);
      const fromIndex = currentIds.indexOf(draggedProfileId);
      const toIndex = currentIds.indexOf(profile.id);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return;
      }

      const reorderedIds = [...currentIds];
      const [movedId] = reorderedIds.splice(fromIndex, 1);
      reorderedIds.splice(toIndex, 0, movedId);

      await runAction(async () => {
        state.data = await window.codexSwitcher.reorderProfiles(reorderedIds);
        renderAll();
        showFlash('账号档案顺序已更新。', { replace: true });
      });
    });

    applyBtn.addEventListener('click', async () => {
      const targetLabel = profile.name || profile.id;
      const confirmed = window.confirm(`切换到档案 "${targetLabel}" 时会先关闭 Codex，再写入此档案。继续吗？`);
      if (!confirmed) {
        return;
      }

      await runAction(async () => {
        state.data = await window.codexSwitcher.applyProfile(profile.id, true);
        renderAll();
        refreshUsageInBackground();
        const backupDir = state.data.lastAction?.backupDir;
        showFlash(`已切换到档案 "${targetLabel}"。切换前状态已备份到：${backupDir}`, { replace: true });
      });
    });

    renameBtn.addEventListener('click', () => {
      openRenameModal(profile);
    });

    deleteBtn.addEventListener('click', async () => {
      const targetLabel = profile.name || profile.id;
      const confirmed = window.confirm(`确定删除档案 "${targetLabel}"？此操作不会影响当前已登录的 Codex，但会移除此档案快照。`);
      if (!confirmed) {
        return;
      }

      await runAction(async () => {
        state.data = await window.codexSwitcher.deleteProfile(profile.id);
        renderAll();
        showFlash(`已删除档案 "${targetLabel}"。`, { replace: true });
      });
    });

    profilesEl.append(card);
  }
}

function renderAll() {
  renderCurrentState(state.data);
  renderProfiles(state.data);
}

function openRenameModal(profile) {
  renameModalEl.dataset.profileId = profile.id;
  renameModalEl.dataset.currentName = profile.name || profile.id;
  renameInputEl.value = profile.name || profile.id;
  renameModalEl.classList.remove('hidden');
  renameModalEl.setAttribute('aria-hidden', 'false');
  queueMicrotask(() => {
    renameInputEl.focus();
    renameInputEl.select();
  });
}

function closeRenameModal() {
  renameModalEl.dataset.profileId = '';
  renameModalEl.dataset.currentName = '';
  renameInputEl.value = '';
  renameModalEl.classList.add('hidden');
  renameModalEl.setAttribute('aria-hidden', 'true');
}

function openAddAccountModal() {
  renderAddMethod();
  addAccountModalEl.classList.remove('hidden');
  addAccountModalEl.setAttribute('aria-hidden', 'false');
}

function closeAddAccountModal() {
  addAccountModalEl.classList.add('hidden');
  addAccountModalEl.setAttribute('aria-hidden', 'true');
}

function openCurrentStateModal() {
  currentStateModalEl.classList.remove('hidden');
  currentStateModalEl.setAttribute('aria-hidden', 'false');
}

function closeCurrentStateModal() {
  currentStateModalEl.classList.add('hidden');
  currentStateModalEl.setAttribute('aria-hidden', 'true');
}

function openOauthPendingModal() {
  oauthPendingModalEl.classList.remove('hidden');
  oauthPendingModalEl.setAttribute('aria-hidden', 'false');
}

function closeOauthPendingModal() {
  oauthPendingModalEl.classList.add('hidden');
  oauthPendingModalEl.setAttribute('aria-hidden', 'true');
}

async function runAction(action) {
  setBusy(true, 'default');
  try {
    await action();
  } catch (error) {
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    setBusy(false);
  }
}

async function refreshUsageInBackground({ silent = true, force = false } = {}) {
  if (state.refreshingUsage) {
    return false;
  }

  state.refreshingUsage = true;
  const requestId = state.refreshRequestId + 1;
  state.refreshRequestId = requestId;

  try {
    const refreshedState = await window.codexSwitcher.refreshUsageState(force);
    if (requestId !== state.refreshRequestId) {
      return false;
    }

    state.data = refreshedState;
    renderAll();
    return true;
  } catch (error) {
    if (!silent) {
      showFlash(error.message || String(error));
    }
    return false;
  } finally {
    if (requestId === state.refreshRequestId) {
      state.refreshingUsage = false;
    }
  }
}

async function refreshAllUsage({ silent = false } = {}) {
  if (state.refreshingUsage) {
    return;
  }

  if (!silent) {
    showFlash('正在重新查询所有账号额度...', { replace: true });
  }

  const success = await refreshUsageInBackground({ silent, force: true });

  if (!silent && success) {
    showFlash('所有账号额度已刷新。', { replace: true });
  }
}

addAccountBtnEl.addEventListener('click', () => {
  openAddAccountModal();
});

refreshUsageBtnEl.addEventListener('click', async () => {
  await refreshAllUsage({ silent: false });
});

themeToggleBtnEl.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

statusBtnEl.addEventListener('click', () => {
  openCurrentStateModal();
});

addAccountModalEl.querySelectorAll('[data-action="close-add-account"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeAddAccountModal();
  });
});

addAccountModalEl.querySelectorAll('[data-add-method-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    state.addMethod = button.dataset.addMethodTab;
    renderAddMethod();
  });
});

async function startOauthLogin() {
  closeAddAccountModal();
  openOauthPendingModal();
  setBusy(true, 'oauth');
  try {
    state.data = await window.codexSwitcher.createProfileWithOAuth();
    renderAll();
    refreshUsageInBackground();
    showFlash('新账号已加入档案列表。', { replace: true });
  } catch (error) {
    if (error?.code === 'OAUTH_CANCELLED' || error?.message === '网页登录已取消。') {
      showFlash('已取消网页授权。', { replace: true });
      return;
    }
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    closeOauthPendingModal();
    setBusy(false);
  }
}

addMethodActionBtnEl.addEventListener('click', async () => {
  const method = state.addMethod;

  if (method === 'oauth') {
    await startOauthLogin();
    return;
  }

  if (method === 'current') {
    closeAddAccountModal();
    await runAction(async () => {
      state.data = await window.codexSwitcher.createProfile();
      renderAll();
      refreshUsageInBackground();
      showFlash('已将当前 Codex 登录状态保存为新档案。', { replace: true });
    });
    return;
  }

  if (method === 'import-auth') {
    closeAddAccountModal();
    await runAction(async () => {
      state.data = await window.codexSwitcher.importAuthProfile();
      renderAll();
      refreshUsageInBackground();
      if (state.data.lastAction?.type === 'import-cancelled') {
        showFlash('已取消导入 auth.json。', { replace: true });
        return;
      }
      showFlash('已从 auth.json 导入新账号。', { replace: true });
    });
  }
});

cancelOAuthBtnEl.addEventListener('click', async () => {
  cancelOAuthBtnEl.disabled = true;
  try {
    await window.codexSwitcher.cancelOAuthLogin();
  } finally {
    cancelOAuthBtnEl.disabled = false;
  }
});

currentStateModalEl.querySelectorAll('[data-action="close-current-state"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeCurrentStateModal();
  });
});

restartCodexBtnEl.addEventListener('click', async () => {
  await runAction(async () => {
    state.data = await window.codexSwitcher.restartCodex();
    renderAll();
    refreshUsageInBackground();
    showFlash('Codex 已重启。', { replace: true });
  });
});

openProfilesBtnEl.addEventListener('click', async () => {
  await window.codexSwitcher.openProfilesFolder();
});

flashCloseBtnEl.addEventListener('click', () => {
  dismissFlash();
});

renameFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profileId = renameModalEl.dataset.profileId;
  const currentName = renameModalEl.dataset.currentName;
  const newName = renameInputEl.value.trim();

  if (!profileId || !newName || newName === currentName) {
    closeRenameModal();
    return;
  }

  await runAction(async () => {
    state.data = await window.codexSwitcher.renameProfile(profileId, newName);
    closeRenameModal();
    renderAll();
    showFlash(`已将档案重命名为 "${newName}"。`, { replace: true });
  });
});

renameModalEl.querySelectorAll('[data-action="close-rename"]').forEach((element) => {
  element.addEventListener('click', () => {
    closeRenameModal();
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!renameModalEl.classList.contains('hidden')) {
      closeRenameModal();
    }
    if (!addAccountModalEl.classList.contains('hidden')) {
      closeAddAccountModal();
    }
    if (!currentStateModalEl.classList.contains('hidden')) {
      closeCurrentStateModal();
    }
  }
});

async function boot() {
  initTheme();
  setBusy(true, 'default');
  try {
    state.data = await window.codexSwitcher.loadState();
    renderAll();
    refreshUsageInBackground({ silent: true, force: true });
    window.setInterval(() => {
      if (state.busy || state.refreshingUsage) {
        return;
      }
      refreshUsageInBackground({ silent: true, force: true });
    }, AUTO_REFRESH_INTERVAL_MS);
  } catch (error) {
    showFlash(error.message || String(error), { replace: true, clearQueue: true });
  } finally {
    setBusy(false);
  }
}

boot();
