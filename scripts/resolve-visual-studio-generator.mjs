import { spawnSync } from 'node:child_process';
import { win32 } from 'node:path';

/** Match CMake's supported generators to installed C++ toolchains, keeping VS 2022 when available. */
export function resolveVisualStudioGenerator(cmake, { env = process.env, run = spawnSync } = {}) {
  const vswhere = win32.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio/Installer/vswhere.exe');
  const installed = run(vswhere, ['-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property', 'installationVersion', '-utf8'], { encoding: 'utf8', windowsHide: true, env });
  const capabilities = run(cmake, ['-E', 'capabilities'], { encoding: 'utf8', windowsHide: true, env });
  if (installed.status !== 0 || capabilities.status !== 0) {
    throw new Error('Cannot detect the installed Visual Studio C++ toolchain and CMake generators.');
  }
  const versions = new Set(installed.stdout.trim().split(/\r?\n/).map(version => Number(version.split('.')[0])));
  const { generators } = JSON.parse(capabilities.stdout);
  const compatible = generators.flatMap(({ name }) => {
    const version = Number(/^Visual Studio (\d+) /.exec(name)?.[1]);
    return versions.has(version) ? [{ name, version }] : [];
  });
  compatible.sort((left, right) => Number(right.version === 17) - Number(left.version === 17)
    || right.version - left.version);
  if (!compatible.length) {
    throw new Error('No compatible Visual Studio C++ generator was found. Install C++ Build Tools or update CMake.');
  }
  return compatible[0].name;
}
