// External classic script: installed before page scripts under the desktop's strict content policy.
(() => {
  const channel = document.currentScript?.dataset.channel;
  const images = new Set();
  const media = new Set();
  let documentLoaded = false;
  let resourcesLoaded = false;
  let notified = false;

  function notifyLoaded() {
    if (!documentLoaded || !resourcesLoaded || notified) return;
    notified = true;
    window.removeEventListener('load', deferLoad, true);
    // Retain one window load notification, after deferred images have usable dimensions.
    queueMicrotask(() => window.dispatchEvent(new Event('load')));
  }

  function deferLoad(event) {
    if (event.target !== document && event.target !== window) return;
    event.stopImmediatePropagation();
    documentLoaded = true;
    notifyLoaded();
  }

  async function complete() {
    for (const element of media) {
      if (!element.currentSrc) element.load();
    }
    // A failed image still releases load, just as a normal document does after an image error.
    await Promise.all([...images].map(image => image.decode().catch(() => undefined)));
    resourcesLoaded = true;
    notifyLoaded();
  }

  function update({ id, attribute, value }) {
    if (!['src', 'poster', 'srcset', 'css'].includes(attribute) || typeof id !== 'string'
      || !/^\d+$/.test(id) || typeof value !== 'string') return;
    if (attribute === 'css') {
      document.documentElement.style.setProperty(`--preview-${channel}-${id}`, `url(${JSON.stringify(value)})`);
      const image = new Image(); image.src = value; images.add(image);
      return;
    }
    const marker = `data-preview-${attribute}`;
    document.querySelectorAll(`[${marker}="${id}"]`).forEach(element => {
      // Preserve selections made by page scripts while the initial resource was still loading.
      if (!element.hasAttribute(attribute)) element.setAttribute(attribute, value);
      element.removeAttribute(marker);
      if (element instanceof HTMLImageElement) images.add(element);
      const parentImage = element.parentElement?.querySelector('img');
      if (element.tagName === 'SOURCE' && parentImage) images.add(parentImage);
      if (element.tagName === 'SOURCE' && element.parentElement instanceof HTMLMediaElement) {
        // Select once after all alternatives arrive, without restarting an already playing video.
        media.add(element.parentElement);
      }
    });
  }

  window.addEventListener('load', deferLoad, true);
  window.addEventListener('message', event => {
    if (!channel || event.source !== parent || event.data?.channel !== channel) return;
    if (event.data.type === 'complete') void complete();
    else update(event.data);
  });
  document.addEventListener('DOMContentLoaded', () => parent.postMessage({ channel, type: 'ready' }, '*'),
    { once: true });
})();
