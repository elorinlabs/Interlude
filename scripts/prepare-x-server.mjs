import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const xServerRelease = {
  version: '21.1.16.1',
  sha256: 'df7fed8f49665d0592528ab6be9d07111ea73c6848283d128b77690e05b8f90b',
  url: 'https://github.com/marchaesen/vcxsrv/releases/download/21.1.16.1/vcxsrv-64.21.1.16.1.installer.exe',
};
const cache = join(root, '.codex-tmp/x-server');
const resources = join(root, 'apps/desktop/src-tauri/resources/x-server');
const destination = join(resources, 'runtime');

export function verifyXServerArchive(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== xServerRelease.sha256) {
    throw new Error('X server archive checksum mismatch');
  }
}

async function archivePath() {
  const archive = join(cache, 'vcxsrv-installer.exe');
  await mkdir(cache, { recursive: true });
  if (!existsSync(archive)) {
    const response = await fetch(xServerRelease.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`X server download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    verifyXServerArchive(bytes);
    await writeFile(`${archive}.partial`, bytes);
    await rename(`${archive}.partial`, archive);
  }
  verifyXServerArchive(await readFile(archive));
  return archive;
}

function extract(archive, destination) {
  const installed = join(process.env.ProgramFiles || 'C:/Program Files', '7-Zip/7z.exe');
  const executable = existsSync(installed) ? installed : '7z';
  const result = spawnSync(executable, ['x', archive, `-o${destination}`, '-y', '-bso0', '-bsp0'], {
    windowsHide: true, stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error('X server extraction failed. Install 7-Zip on the Windows build machine.');
  }
}

/** Extracts the pinned upstream distribution without running its installer or requiring elevation. */
export async function prepareXServer() {
  if (process.platform !== 'win32') return;
  const marker = join(destination, 'archive.sha256');
  const required = ['vcxsrv.exe', 'xkbcomp.exe', 'xkbdata', 'fonts', 'libX11.dll', 'vcruntime140.dll'];
  if (existsSync(marker) && (await readFile(marker, 'utf8')).trim() === xServerRelease.sha256
    && required.every(name => existsSync(join(destination, name)))) return;
  const archive = await archivePath();
  const extracted = join(cache, `extracted-${xServerRelease.version}`);
  extract(archive, extracted);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(extracted)) {
    // NSIS installer plugins and uninstallers are not runtime dependencies.
    if (entry.startsWith('$') || /^uninstall/i.test(entry)) continue;
    await cp(join(extracted, entry), join(destination, entry), { recursive: true });
  }
  if (!required.every(name => existsSync(join(destination, name)))) {
    throw new Error('The extracted X server runtime is incomplete');
  }
  await writeFile(marker, `${xServerRelease.sha256}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareXServer();
