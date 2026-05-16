'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');

const execFileAsync = promisify(execFile);

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
    return {
      kind: 'path',
      target: exePath
    };
  } catch {
    if (pkg.PackageFamilyName) {
      return {
        kind: 'appx',
        target: `shell:AppsFolder\\${pkg.PackageFamilyName}!App`
      };
    }
  }

  return null;
}

async function resolveLaunchTarget() {
  const running = await getRunningCodexProcesses();
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
  const launchTarget = await resolveLaunchTarget();
  const running = await getRunningCodexProcesses();

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
