function svgNode(name, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function createPointerLayer(ownerId) {
  const host = document.createElement('div');
  host.setAttribute('data-remote-ai-pointer', ownerId);
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  host.style.cssText = 'all:initial;position:fixed!important;left:0!important;top:0!important;'
    + 'width:0!important;height:0!important;pointer-events:none!important;z-index:2147483647!important;'
    + 'opacity:1;transition:opacity 160ms ease;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host,*{pointer-events:none!important}.cursor{display:block;overflow:visible;'
    + 'filter:drop-shadow(0 1px 2px #0005);transform-origin:2px 1px;transition:transform 100ms ease}'
    + '.ring{position:absolute;left:2px;top:1px;width:26px;height:26px;border:1.5px solid #1116;'
    + 'background:#1111;border-radius:50%;box-sizing:border-box;opacity:0;'
    + 'transform:translate(-50%,-50%)}';
  const cursor = svgNode('svg', { class: 'cursor', width: '28', height: '32', viewBox: '0 0 28 32' });
  cursor.append(svgNode('path', {
    d: 'M2 1Q1 1.7 1.1 3L3 29Q3.2 32 5.2 29.8L12.6 20.6L24.2 19.4Q27 19.1 24.8 17.4L4.3 1.3Q2.8 .2 2 1Z',
    fill: '#000000', stroke: '#000000', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }));
  const ring = document.createElement('div');
  ring.className = 'ring';
  shadow.append(style, ring, cursor);
  document.documentElement.append(host);
  return { host, cursor, ring };
}

function moveLayer(state, action) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const durationMs = action.animate && !reduced ? 180 : 0;
  const previous = { x: state.x ?? Math.max(2, action.x - 32), y: state.y ?? Math.max(1, action.y - 24) };
  const transform = (x, y) => `translate(${x - 2}px,${y - 1}px)`;
  state.movement?.cancel();
  state.host.style.transform = transform(action.x, action.y);
  if (durationMs) state.movement = state.host.animate([
    { transform: transform(previous.x, previous.y) }, { transform: transform(action.x, action.y) },
  ], { duration: durationMs, easing: 'cubic-bezier(.2,.7,.3,1)' });
  state.x = action.x;
  state.y = action.y;
  return durationMs;
}

function pulseLayer(state) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  state.pulse?.cancel();
  const transform = scale => `translate(-50%,-50%) scale(${scale})`;
  state.pulse = state.ring.animate([
    { opacity: 0.65, transform: transform(reduced ? 1 : 0.5) },
    { opacity: 0, transform: transform(reduced ? 1 : 1.8) },
  ], { duration: reduced ? 120 : 420, easing: 'ease-out' });
}

function updatePointer(action) {
  const key = '__remoteAIControlPointer';
  let state = globalThis[key];
  if (state && !state.host.isConnected) { state.dispose(); state = undefined; }
  if (!state) {
    state = { ...createPointerLayer(action.ownerId) };
    state.dispose = () => {
      clearTimeout(state.idleTimer);
      state.movement?.cancel();
      state.pulse?.cancel();
      state.host.remove();
      if (globalThis[key] === state) delete globalThis[key];
    };
    state.host.addEventListener('remote-ai-pointer-clear', state.dispose, { once: true });
    globalThis[key] = state;
  }
  clearTimeout(state.idleTimer);
  state.host.style.opacity = '1';
  const durationMs = moveLayer(state, action);
  if (action.phase === 'press') { state.cursor.style.transform = 'scale(.88)'; pulseLayer(state); }
  if (action.phase === 'release') state.cursor.style.transform = 'scale(1)';
  // One bounded timer also hides the indicator if permission revocation prevents explicit cleanup.
  state.idleTimer = setTimeout(() => { state.host.style.opacity = '0'; }, 2000);
  return durationMs;
}

// These functions run in a named isolated world. Only this fixed implementation is serialized;
// coordinates and the extension identity travel as protocol arguments, never as executable text.
export const POINTER_FUNCTION = `function(action) {
  ${[svgNode, createPointerLayer, moveLayer, pulseLayer, updatePointer].map(fn => fn.toString()).join('\n')}
  return updatePointer(action);
}`;

export function removePointerLayers(ownerId) {
  for (const host of document.querySelectorAll('[data-remote-ai-pointer]')) {
    if (host.getAttribute('data-remote-ai-pointer') !== ownerId) continue;
    host.dispatchEvent(new Event('remote-ai-pointer-clear'));
    host.remove();
  }
}
