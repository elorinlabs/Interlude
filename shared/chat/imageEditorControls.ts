import type { MessageKey } from '@interlude/i18n';
import { imageEditorIcon, type ImageEditorIcon } from './imageEditorIcons';

const TOOLS: [ImageEditorIcon, MessageKey][] = [
  ['pen', 'client.shared.pen'], ['arrow', 'client.shared.arrow'], ['rectangle', 'client.shared.rectangle'],
  ['text', 'client.shared.text'], ['mosaic', 'client.shared.mosaic'], ['eraser', 'client.shared.eraser'],
];
const COLORS: [string, MessageKey][] = [
  ['#ef4444', 'client.shared.red'], ['#facc15', 'client.shared.yellow'], ['#22c55e', 'client.shared.green'],
  ['#3b82f6', 'client.shared.blue'], ['#ffffff', 'client.shared.white'], ['#111111', 'client.shared.black'],
];
const COLOR_CHANNELS = ['client.shared.red', 'client.shared.green', 'client.shared.blue'] as const;
const WIDTHS = [
  [3, 4, 'client.shared.extraThin'], [6, 8, 'client.shared.thin'], [10, 12, 'client.shared.medium'],
  [16, 17, 'client.shared.thick'], [24, 23, 'client.shared.extraThick'],
] as const;

export function imageEditorTools(label: (key: MessageKey) => string, desktop = false) {
  const tools: [ImageEditorIcon, MessageKey][] = desktop
    ? [['pen', 'client.shared.pen'], ['arrow', 'client.shared.arrow'],
      ['rectangle', 'client.shared.rectangle.88b75a'], ['circle', 'client.shared.circle'], ...TOOLS.slice(3)] : TOOLS;
  return `<div id="tools" role="group" aria-label="${label('client.shared.annotationTools')}">
${tools.map(([tool, name]) => `<button class="tool" data-tool="${tool}" aria-pressed="${tool === 'pen'}">
  ${imageEditorIcon(tool)}<span>${label(name)}</span></button>`).join('')}
</div>`;
}

export function imageEditorColors(label: (key: MessageKey) => string) {
  return `<div id="colors" role="group" aria-label="${label('client.shared.annotationColor')}">
${COLORS.map(([color, name], index) => `<button class="color" data-color="${color}" aria-label="${label(name)}"
  aria-pressed="${index === 0}"><span class="swatch" style="background:${color}"></span></button>`).join('')}
<button class="color" id="custom-color" aria-label="${label('client.shared.customColor')}" aria-pressed="false">
  <span class="swatch rainbow"></span></button>
</div>`;
}

export function imageEditorWidths(label: (key: MessageKey) => string, desktop = false) {
  return `<div id="widths" role="group" aria-labelledby="width-label">
${WIDTHS.map(([width, dot, name]) => `<button class="width" data-width="${desktop && width === 6 ? 4 : width}"
  aria-label="${label(name)}" aria-pressed="${width === 6}">
  <span><i style="--dot:${dot}px"></i></span></button>`).join('')}</div>`;
}

export function imageEditorControls(label: (key: MessageKey) => string) {
  return `<footer>${imageEditorTools(label)}${imageEditorColors(label)}
<div class="width-row"><span class="width-label" id="width-label">${label('client.shared.strokeWidth')}</span>
${imageEditorWidths(label)}</div><div class="bottom">
<button id="reset" disabled>${imageEditorIcon('reset')}${label('client.shared.reset')}</button>
<p id="notice" role="status">${label('client.chat.loadingImage')}</p>
<div class="history"><button id="redo" aria-label="${label('client.projectBrowser.redo')}" hidden>
${imageEditorIcon('redo')}</button>
<button id="undo" aria-keyshortcuts="Control+z Meta+z" disabled>
${imageEditorIcon('undo')}${label('client.projectBrowser.undo')}</button></div>
</div></footer>`;
}

export function imageEditorDialogs(label: (key: MessageKey) => string) {
  return `<dialog id="text-dialog" aria-labelledby="text-title">
<h2 id="text-title">${label('client.shared.addText')}</h2>
<textarea id="text-value" aria-label="${label('client.shared.annotationText')}"
  placeholder="${label('client.shared.enterYourAnnotation')}"
  maxlength="200" rows="3"></textarea><div class="dialog-actions">
<button type="button" data-close="text-dialog">${label('client.accounts.cancel')}</button>
<button class="primary" id="text-add" type="button">${label('client.shared.add')}</button></div></dialog>
<dialog id="color-dialog" aria-labelledby="color-title">
<h2 id="color-title">${label('client.shared.customColor')}</h2><div class="color-preview" id="color-preview"></div>
${COLOR_CHANNELS.map((name, index) => `<label class="color-channel">${label(name)}
  <input type="range" data-channel="${index}" min="0" max="255" value="0"></label>`).join('')}
<input id="color-value" aria-label="${label('client.shared.hexColor')}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required
  autocomplete="off" spellcheck="false"><div class="dialog-actions">
<button type="button" data-close="color-dialog">${label('client.accounts.cancel')}</button>
<button class="primary" id="color-apply" type="button">${label('client.shared.useColor')}</button></div></dialog>`;
}
