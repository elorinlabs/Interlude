// Use raw CDP only to drive the isolated extension worker. Playwright page setup enables focus
// emulation itself and would mask regressions in the extension's own background-input preparation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { chromium } from '@playwright/test';
import { testBrowserArguments, testBrowserExecutable } from '../test-browser.mjs';

async function connect(profile) {
  let address;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { address = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); break; }
    catch { await delay(100); }
  }
  if (!address) throw new Error('Test Chrome did not start its debugging endpoint');
  const socket = new WebSocket(`ws://127.0.0.1:${address[0]}${address[1]}`);
  await once(socket, 'open');
  let sequence = 0;
  const pending = new Map();
  socket.on('message', bytes => {
    const message = JSON.parse(bytes);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { socket, send };
}

async function attachWorker(cdp, extensionId) {
  let target;
  for (let attempt = 0; attempt < 100; attempt++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    target = targetInfos.find(item => item.type === 'service_worker'
      && item.url === `chrome-extension://${extensionId}/background.js`);
    if (target) break;
    await delay(100);
  }
  if (!target) throw new Error('Test extension did not start');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  return async expression => {
    const result = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
}

export async function launchExtensionTest({ executable, extension, profile, extensionId }) {
  const headed = process.platform === 'win32';
  const browserExecutable = testBrowserExecutable(executable, chromium.executablePath());
  const child = spawn(browserExecutable, [...testBrowserArguments(), headed ? '--no-startup-window' : '--headless=new',
    '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
    ...(headed ? [] : ['about:blank'])], { windowsHide: true, stdio: 'ignore' });
  let cdp;
  const close = async () => {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => {}); // Chrome can close the socket before acknowledging shutdown.
      cdp.socket.close();
    }
    if (child.exitCode === null) child.kill();
  };
  try {
    cdp = await connect(profile);
    const evaluate = await attachWorker(cdp, extensionId);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('typeof globalThis.run === "function"')) return { evaluate, close };
      await delay(100);
    }
    throw new Error('Test worker did not initialize');
  } catch (error) { await close(); throw error; }
}
