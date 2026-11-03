import { authorize, assertRunning } from './permissions.js';
import { website } from './validation.js';
import { acquireConnection, assertConnected, finishConnection, releaseConnection, connectionOwner }
  from './debugger-connections.js';
import { queueTarget } from './target-queue.js';
import { t } from './i18n.js';

const MAX_LIST_WORKERS = 100;
const MAX_WORKER_URL = 2000;
const MAX_WORKER_TITLE = 200;

export function workerWebsite(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(t('workerSiteUnknown')); }
  return website(url.protocol === 'blob:' ? url.origin : value).href;
}

function isWebsiteWorker(target) {
  if (target.type !== 'worker') return false;
  try { workerWebsite(target.url); return true; }
  catch { return false; }
}

export async function listWorkers() {
  const targets = (await chrome.debugger.getTargets()).filter(isWebsiteWorker);
  const workers = targets.slice(0, MAX_LIST_WORKERS).map(target => ({
    workerId: target.id, url: target.url.slice(0, MAX_WORKER_URL),
    title: (target.title ?? '').slice(0, MAX_WORKER_TITLE),
    truncated: target.url.length > MAX_WORKER_URL || (target.title ?? '').length > MAX_WORKER_TITLE,
  }));
  return { workers, scope: 'profile',
    truncated: targets.length > MAX_LIST_WORKERS || workers.some(item => item.truncated) };
}

export function withWorker(context, args, operation) {
  return queueTarget({ targetId: args.workerId }, () => run(context, args.workerId, operation));
}

async function findWorker(context, workerId) {
  assertRunning(context.signal);
  const worker = (await chrome.debugger.getTargets()).find(target => target.id === workerId && isWebsiteWorker(target));
  if (!worker) throw new Error(t('workerStopped'));
  await authorize(workerWebsite(worker.url), context.clientId, context.signal);
  return worker;
}

async function run(context, workerId, operation) {
  const worker = await findWorker(context, workerId);
  const workerUrl = worker.url;
  const target = { targetId: workerId };
  const owner = connectionOwner(context);
  const connection = await acquireConnection(target, context.signal, owner).catch(() => {
    assertRunning(context.signal);
    throw new Error(t('workerConnectFailed'));
  });
  const guard = async () => {
    const current = await findWorker(context, workerId);
    assertConnected(connection);
    if (current.url !== workerUrl) throw new Error(t('workerChanged'));
  };
  // Cancellation must release a debugger command awaiting a worker that is shutting down.
  const abort = () => { void finishConnection(target, owner); };
  context.signal?.addEventListener('abort', abort, { once: true });
  if (context.signal?.aborted) abort();
  let completed = false;
  try {
    await guard();
    const result = await operation({ target, guard, worker: { targetId: workerId, url: workerUrl, type: 'worker' } });
    await guard();
    completed = true;
    return result;
  } finally {
    await releaseConnection(connection, completed && !context.signal?.aborted, owner);
    context.signal?.removeEventListener('abort', abort);
  }
}
