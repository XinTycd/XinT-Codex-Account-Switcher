'use strict';

const FIVE_HOUR_MINUTES = 300;
const WEEKLY_MINUTES = 7 * 24 * 60;

function normalizeWindow(window, limitName = null) {
  if (!window || !Number.isFinite(window.limit_window_seconds)) {
    return null;
  }

  return {
    limitName,
    usedPercent: Number.isFinite(window.used_percent) ? window.used_percent : 0,
    remainingPercent: Number.isFinite(window.used_percent)
      ? Math.max(0, Math.min(100, 100 - window.used_percent))
      : 100,
    windowMinutes: window.limit_window_seconds / 60,
    resetsAt: Number.isFinite(window.reset_at) ? window.reset_at : null
  };
}

function collectUsageWindows(usage) {
  const windows = [];

  for (const window of [usage?.rate_limit?.primary_window, usage?.rate_limit?.secondary_window]) {
    const normalized = normalizeWindow(window, null);
    if (normalized) {
      windows.push(normalized);
    }
  }

  for (const item of usage?.additional_rate_limits ?? []) {
    for (const window of [item?.rate_limit?.primary_window, item?.rate_limit?.secondary_window]) {
      const normalized = normalizeWindow(window, item?.limit_name ?? null);
      if (normalized) {
        windows.push(normalized);
      }
    }
  }

  return windows;
}

function pickClosestWindow(windows, targetMinutes) {
  if (!windows.length) {
    return null;
  }

  return windows.reduce((best, candidate) => {
    const candidateDelta = Math.abs(candidate.windowMinutes - targetMinutes);
    const bestDelta = Math.abs(best.windowMinutes - targetMinutes);

    if (candidateDelta < bestDelta) {
      return candidate;
    }

    if (candidateDelta > bestDelta) {
      return best;
    }

    return candidate.windowMinutes > best.windowMinutes ? candidate : best;
  });
}

function summarizeUsage(usage) {
  const allWindows = collectUsageWindows(usage);
  const shortWindows = allWindows.filter((item) => item.windowMinutes < 24 * 60);
  const longWindows = allWindows.filter((item) => item.windowMinutes >= 24 * 60);

  return {
    accountId: usage?.account_id ?? null,
    email: usage?.email ?? null,
    planType: usage?.plan_type ?? null,
    fiveHour: pickClosestWindow(shortWindows, FIVE_HOUR_MINUTES),
    weekly: pickClosestWindow(longWindows, WEEKLY_MINUTES)
  };
}

module.exports = {
  FIVE_HOUR_MINUTES,
  WEEKLY_MINUTES,
  collectUsageWindows,
  summarizeUsage
};
