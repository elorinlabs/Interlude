import { authorize } from './permissions.js';
import { POINTER_FUNCTION, removePointerLayers } from './pointer-overlay.js';

const contexts = new WeakMap();
const visibleFrames = new Map();
const WORLD_NAME = 'remote-ai-operation-pointer';
const MAX_MOVE_DURATION_MS = 180;

async function pointerContext(driver, frameId) {
  let cache = contexts.get(driver);
  if (!cache) { cache = new Map(); contexts.set(driver, cache); }
  if (cache.has(frameId)) return cache.get(frameId);
  // Input coordinates are relative to the session's root viewport. Same-process child frames
  // share the top overlay; out-of-process frames get their own correctly positioned overlay.
  const { frameTree } = await driver.send('Page.getFrameTree', {}, frameId);
  const frame = frameTree.frame;
  await authorize(frame.url, driver.context.clientId, driver.context.signal);
  if (visibleFrames.has(driver.tab.id) && visibleFrames.get(driver.tab.id) !== frame.id) {
    await clearTabPointer(driver.tab.id);
  }
  const { executionContextId } = await driver.send('Page.createIsolatedWorld', {
    frameId: frame.id, worldName: `${WORLD_NAME}-${chrome.runtime.id}`,
  }, frameId);
  visibleFrames.set(driver.tab.id, frame.id);
  cache.set(frameId, executionContextId);
  return executionContextId;
}

export async function showPointer(driver, position, { phase = 'move', animate = false } = {}) {
  try {
    const executionContextId = await pointerContext(driver, position.frameId);
    const result = await driver.send('Runtime.callFunctionOn', {
      executionContextId, functionDeclaration: POINTER_FUNCTION, returnByValue: true,
      arguments: [{ value: { x: position.x, y: position.y, phase, animate, ownerId: chrome.runtime.id } }],
    }, position.frameId);
    const duration = result.exceptionDetails ? 0 : result.result?.value;
    // Wait outside the page: background throttling must never hold a browser operation open.
    if (animate && duration > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.min(duration, MAX_MOVE_DURATION_MS)));
    }
  } catch {
    // Cosmetic rendering failures must not prevent input. Pause, cancellation and revoked access still fail.
    await driver.guard();
  }
  await driver.guard();
}

export async function movePointer(driver, position) {
  await showPointer(driver, position, { animate: true });
  await driver.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: position.x, y: position.y },
    position.frameId);
}

export async function clearTabPointer(tabId) {
  if (!visibleFrames.delete(tabId)) return;
  try {
    // Cleanup touches only our marker in previously used documents; it reads no page content.
    // Child debugger sessions have already ended, so remove their overlays through the extension API.
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true },
      func: removePointerLayers, args: [chrome.runtime.id] });
  } catch {
    // Closed pages and revoked host permissions may prevent cleanup; the idle timer still hides the pointer.
  }
}
