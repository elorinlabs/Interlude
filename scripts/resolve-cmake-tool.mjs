import { spawnSync } from 'node:child_process';
import { win32 } from 'node:path';

const visualStudioCmakeBin = 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin';

function windowsCandidates(tool, env, run) {
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const vswhere = win32.join(programFilesX86, 'Microsoft Visual Studio/Installer/vswhere.exe');
  // Query registered installations so custom locations and Build Tools are supported.
  const result = run(vswhere, ['-products', '*', '-find', win32.join(visualStudioCmakeBin, `${tool}.exe`), '-utf8'], {
    encoding: 'utf8', windowsHide: true, env,
  });
  const bundled = result.status === 0 ? result.stdout.split(/\r?\n/).map(path => path.trim()).filter(Boolean) : [];
  return [...bundled, win32.join(programFiles, 'CMake/bin', `${tool}.exe`)];
}

/** Prefer PATH, then find Windows CMake tools without changing the caller's environment. */
export function resolveCmakeTool(tool, { platform = process.platform, env = process.env, run = spawnSync } = {}) {
  const works = command => {
    const result = run(command, ['--version'], { stdio: 'ignore', windowsHide: true, env });
    return !result.error && result.status === 0;
  };
  if (works(tool)) return tool;
  if (platform === 'win32') {
    const executable = windowsCandidates(tool, env, run).find(works);
    if (executable) return executable;
    throw new Error(`Unable to run ${tool}. Install "C++ CMake tools for Windows" in Visual Studio Installer, `
      + 'or install CMake and add its bin directory to PATH, then reopen your terminal.');
  }
  throw new Error(`Unable to run ${tool}. Install CMake and add its bin directory to PATH, then reopen your terminal.`);
}
