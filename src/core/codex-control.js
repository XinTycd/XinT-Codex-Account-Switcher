'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');

const execFileAsync = promisify(execFile);
const APPX_TARGET_CACHE_TTL_MS = 5 * 60 * 1000;
let appxLaunchTargetCache = {
  value: null,
  fetchedAt: 0
};

async function runPowerShell(command) {
  const { stdout } = await execFileAsync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command
    ],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4
    }
  );

  return stdout.trim();
}

async function getRunningCodexProcesses() {
  const output = await runPowerShell(`
    $items = Get-Process |
      Where-Object { $_.ProcessName -match '^(Codex|codex)$' } |
      Select-Object ProcessName, Id, Path
    $items | ConvertTo-Json
  `);

  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function stopCodexProcesses() {
  await runPowerShell(`
    Get-Process |
      Where-Object { $_.ProcessName -match '^(Codex|codex)$' } |
      Stop-Process -Force -ErrorAction SilentlyContinue
  `);
}

async function resolveAppxLaunchTarget() {
  if (
    appxLaunchTargetCache.value
    && Date.now() - appxLaunchTargetCache.fetchedAt < APPX_TARGET_CACHE_TTL_MS
  ) {
    return appxLaunchTargetCache.value;
  }

  const output = await runPowerShell(`
    $pkg = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1 InstallLocation, PackageFamilyName
    if ($pkg) { $pkg | ConvertTo-Json }
  `);

  if (!output) {
    return null;
  }

  const pkg = JSON.parse(output);
  const exePath = path.join(pkg.InstallLocation, 'app', 'Codex.exe');

  try {
    await fs.access(exePath);
    appxLaunchTargetCache = {
      fetchedAt: Date.now(),
      value: {
        kind: 'path',
        target: exePath
      }
    };
    return appxLaunchTargetCache.value;
  } catch {
    if (pkg.PackageFamilyName) {
      appxLaunchTargetCache = {
        fetchedAt: Date.now(),
        value: {
          kind: 'appx',
          target: `shell:AppsFolder\\${pkg.PackageFamilyName}!App`
        }
      };
      return appxLaunchTargetCache.value;
    }
  }

  return null;
}

async function resolveLaunchTarget(runningProcesses = null) {
  const running = runningProcesses ?? await getRunningCodexProcesses();
  const direct = running.find((item) => item.Path && item.Path.endsWith('Codex.exe'));
  if (direct) {
    return {
      kind: 'path',
      target: direct.Path
    };
  }

  return resolveAppxLaunchTarget();
}

async function launchCodex() {
  const launchTarget = await resolveLaunchTarget();
  if (!launchTarget) {
    throw new Error('未找到 Codex 启动入口。');
  }

  if (launchTarget.kind === 'path') {
    await runPowerShell(`Start-Process -FilePath '${launchTarget.target.replace(/'/g, "''")}'`);
    return launchTarget;
  }

  await runPowerShell(`Start-Process '${launchTarget.target.replace(/'/g, "''")}'`);
  return launchTarget;
}

async function getCodexRuntimeSummary() {
  const running = await getRunningCodexProcesses();
  const launchTarget = await resolveLaunchTarget(running);

  return {
    runningCount: running.length,
    running,
    launchTarget
  };
}

module.exports = {
  getCodexRuntimeSummary,
  launchCodex,
  stopCodexProcesses
};
