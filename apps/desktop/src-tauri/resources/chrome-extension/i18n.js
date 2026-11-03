import defaults from './messages.generated.js';

// Chrome selects its UI language; generated defaults also work outside Chrome, including Node tests.
export function t(name, fallback = name) {
  return globalThis.chrome?.i18n?.getMessage?.(name) || defaults[name] || fallback;
}

const ATTRIBUTES = [
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
  ['data-i18n-placeholder', 'placeholder'],
];

// Extension pages cannot use __MSG_*__ in HTML, so marked elements are translated when the page loads.
export function localizeDocument(root = document) {
  const page = root.documentElement;
  page.lang = t('htmlLang', page.lang);
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n, element.textContent);
  }
  for (const [marker, attribute] of ATTRIBUTES) {
    for (const element of root.querySelectorAll(`[${marker}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(marker), element.getAttribute(attribute)));
    }
  }
}
