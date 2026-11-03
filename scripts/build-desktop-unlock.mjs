import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCmakeTool } from './resolve-cmake-tool.mjs';
import { resolveVisualStudioGenerator } from './resolve-visual-studio-generator.mjs';

export function buildDesktopUnlock() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return;
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = resolve(root, '.codex-tmp/desktop-unlock-build');
  const source = resolve(root, 'apps/desktop/src-tauri/desktop-unlock');
  const output = resolve(root, 'apps/desktop/src-tauri/resources/desktop-service');
  const cmake = resolveCmakeTool('cmake');
  run(cmake, ['-S', source, '-B', directory, '-G', resolveVisualStudioGenerator(cmake), '-A', 'x64',
    '-DCMAKE_SYSTEM_VERSION=10.0.26100.0', `-DUNLOCK_OUTPUT=${output}`]);
  run(cmake, ['--build', directory, '--config', 'Release', '--parallel']);
  run(resolveCmakeTool('ctest'), ['--test-dir', directory, '-C', 'Release', '--output-on-failure']);
}
function run(command, args) {
  const result = spawnSync(command, args, { windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Windows sign-in component build failed');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildDesktopUnlock();
