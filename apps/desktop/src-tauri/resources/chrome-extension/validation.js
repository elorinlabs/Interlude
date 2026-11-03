import { t } from './i18n.js';

const TAB_OPERATIONS = new Set([
  'navigate', 'back', 'forward', 'reload', 'close', 'focus', 'snapshot', 'frames', 'click',
  'fill', 'type', 'key', 'scroll', 'select', 'check', 'drag', 'screenshot', 'wait',
]);
const OPERATIONS = new Set(['status', 'tabs', 'open', 'workers', 'console_logs', 'finish', ...TAB_OPERATIONS]);
const MAX_TEXT_LENGTH = 20000;
const MAX_FINISH_TARGETS = 100;
const MAX_CONSOLE_ENTRIES = 200;
const MAX_CONSOLE_FILTER_LENGTH = 500;

export function website(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(t('enterFullUrl')); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(t('regularPagesOnly'));
  }
  return url;
}

function finite(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function text(value, maximum = MAX_TEXT_LENGTH, allowEmpty = true) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0);
}

export function validate(request) {
  const { operation, args = {} } = request ?? {};
  if (!OPERATIONS.has(operation) || !args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error(t('invalidBrowserRequest'));
  }
  if (TAB_OPERATIONS.has(operation) && (!Number.isSafeInteger(args.tabId) || args.tabId < 0)) {
    throw new Error(t('selectTabFirst'));
  }
  if (['open', 'navigate'].includes(operation)) website(args.url);
  if (operation === 'open' && args.background !== undefined && typeof args.background !== 'boolean') {
    throw new Error(t('invalidTabOpenMode'));
  }
  if (args.frameId !== undefined && !text(args.frameId, 100, false)) throw new Error(t('invalidFrame'));
  if (['fill', 'type'].includes(operation) && !text(args.text)) throw new Error(t('invalidInputText'));
  if (['fill', 'type', 'select', 'check'].includes(operation) && !text(args.ref, 100, false)) {
    throw new Error(t('readPageBeforeAction'));
  }
  if (operation === 'select' && !text(args.value)) throw new Error(t('invalidOption'));
  if (operation === 'check' && typeof args.checked !== 'boolean') throw new Error(t('invalidCheckedState'));
  if (operation === 'click') validateClick(args);
  if (operation === 'scroll') validateScroll(args);
  if (operation === 'console_logs') validateConsoleLogs(args);
  if (operation === 'finish') validateFinish(args);
  if (operation === 'key' && !text(args.key, 60, false)) throw new Error(t('invalidKey'));
  if (operation === 'wait' && (!text(args.text, 500, false)
    || (args.timeoutMs !== undefined && !finite(args.timeoutMs, 100, 20000)))) {
    throw new Error(t('invalidWaitCondition'));
  }
  if (operation === 'drag' && (!text(args.fromRef, 100, false) || !text(args.toRef, 100, false))) {
    throw new Error(t('readPageBeforeDrag'));
  }
  return { operation, args };
}

function validateFinish(args) {
  const tabId = value => Number.isSafeInteger(value) && value >= 0;
  const identifiers = (values, valid) => Array.isArray(values) && values.length <= MAX_FINISH_TARGETS
    && values.every(valid) && new Set(values).size === values.length;
  if (!identifiers(args.tabIds, tabId)
    || !identifiers(args.keepTabIds ?? [], value => tabId(value) && args.tabIds.includes(value))
    || !identifiers(args.workerIds ?? [], value => text(value, 100, false))) {
    throw new Error(t('invalidFinishTargets'));
  }
}

function validateConsoleLogs(args) {
  validateLogTarget(args);
  if (args.source !== undefined && !['all', 'page', 'network', 'worker', 'browser'].includes(args.source)) {
    throw new Error(t('invalidLogSource'));
  }
  if (args.level !== undefined && !['all', 'debug', 'log', 'info', 'warn', 'error'].includes(args.level)) {
    throw new Error(t('invalidLogLevel'));
  }
  if (args.limit !== undefined && (!Number.isInteger(args.limit) || !finite(args.limit, 1, MAX_CONSOLE_ENTRIES))) {
    throw new Error(t('invalidLogLimit'));
  }
  if (args.since !== undefined && !finite(args.since, 0, Number.MAX_SAFE_INTEGER)) {
    throw new Error(t('invalidLogSince'));
  }
  if (args.text !== undefined && !text(args.text, MAX_CONSOLE_FILTER_LENGTH, false)) {
    throw new Error(t('invalidLogText'));
  }
}

function validateLogTarget(args) {
  if (args.workerId !== undefined) {
    if (!text(args.workerId, 100, false) || args.tabId !== undefined || args.frameId !== undefined) {
      throw new Error(t('invalidLogTarget'));
    }
    if (args.source === 'page') throw new Error(t('workerHasNoPageLogs'));
    return;
  }
  if (!Number.isSafeInteger(args.tabId) || args.tabId < 0) throw new Error(t('selectTabFirst'));
}

function validateClick(args) {
  if (args.doubleClick !== undefined && typeof args.doubleClick !== 'boolean') {
    throw new Error(t('invalidClickType'));
  }
  const reference = text(args.ref, 100, false);
  if (!reference && (!finite(args.x, 0, 50000) || !finite(args.y, 0, 50000))) {
    throw new Error(t('invalidClickPosition'));
  }
  if (args.button !== undefined && !['left', 'right', 'middle'].includes(args.button)) {
    throw new Error(t('invalidMouseButton'));
  }
}

function validateScroll(args) {
  if (!finite(args.deltaY, -10000, 10000) || !finite(args.deltaX ?? 0, -10000, 10000)) {
    throw new Error(t('invalidScrollDistance'));
  }
  for (const key of ['x', 'y']) {
    if (args[key] !== undefined && !finite(args[key], 0, 50000)) throw new Error(t('invalidScrollPosition'));
  }
}
