const ICON_PATHS = {
  search: 'm21 21-4.3-4.3 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  chevron: 'm9 6 6 6-6 6',
  previous: 'm6 15 6-6 6 6',
  next: 'm6 9 6 6 6-6',
  replace: 'm15 8 5 5-5 5 M20 13H4l5-5',
};

export function searchIcon(name: keyof typeof ICON_PATHS) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const attributes = { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.append(path);
  return svg;
}

export function searchElement(className: string, ...children: Node[]) {
  const element = document.createElement('div');
  element.className = className;
  element.append(...children);
  return element;
}

export function searchButton(options: { label: string; content?: Node | string; className?: string; run: () => void }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className ?? 'pf-search-action';
  button.setAttribute('aria-label', options.label);
  button.append(options.content ?? options.label);
  button.addEventListener('click', options.run);
  return button;
}

export function searchInput(name: string, label: string) {
  const input = document.createElement('input');
  input.name = name;
  input.type = 'text';
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.setAttribute('form', '');
  input.autocomplete = 'off';
  input.spellcheck = false;
  return input;
}
