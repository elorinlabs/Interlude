import type { MessageKey } from '@interlude/i18n';
import { imageEditorColors, imageEditorTools, imageEditorWidths } from './imageEditorControls';
import { imageEditorIcon, type ImageEditorIcon } from './imageEditorIcons';

export function imageEditorDesktop(label: (key: MessageKey) => string) {
  const iconButton = (id: string, icon: ImageEditorIcon, name: MessageKey, attributes = '') =>
    `<button id="${id}" aria-label="${label(name)}" ${attributes}>${imageEditorIcon(icon)}</button>`;
  return `<header><div class="heading"><h1>${label('client.chat.annotateImage.46176b')}</h1>
<p>${label('client.shared.addAnnotationsNotesOrHighlightsToYourImage')}</p></div></header>
<main id="stage"><canvas id="canvas" aria-label="${label('client.shared.imageAnnotationCanvas')}"></canvas></main>
<aside class="editor-panel" aria-label="${label('client.shared.annotationTools')}">
<section><h2>${label('client.shared.annotationTools')}</h2>${imageEditorTools(label, true)}</section>
<section><h2>${label('client.shared.color')}</h2>${imageEditorColors(label)}</section>
<section class="stroke-section"><h2 id="width-label">
<label for="stroke-width">${label('client.shared.strokeWidth')}</label></h2>
<div class="stroke-slider"><input id="stroke-width" type="range" min="1" max="24" value="4">
<output id="stroke-width-value" for="stroke-width">4 px</output></div>${imageEditorWidths(label, true)}</section>
<p id="notice" role="status">${label('client.chat.loadingImage')}</p></aside>
<div class="canvas-toolbar">
<div class="viewport-controls">
${iconButton('pan', 'pan', 'client.shared.panImage', 'aria-pressed="false"')}
<div class="zoom-controls">${iconButton('zoom-out', 'minus', 'client.shared.zoomOut')}
<output id="zoom-value" aria-label="${label('client.shared.zoomLevel')}">100%</output>
${iconButton('zoom-in', 'plus', 'client.shared.zoomIn')}</div>
${iconButton('fit', 'fit', 'client.shared.fitToCanvas')}</div>
<div class="history">${iconButton('undo', 'undo', 'client.projectBrowser.undo',
    'aria-keyshortcuts="Control+z Meta+z" disabled')}
${iconButton('redo', 'redo', 'client.projectBrowser.redo', 'disabled')}
<button id="reset" disabled>${label('client.shared.reset')}</button></div></div>
<div class="editor-actions"><button id="cancel">${label('client.accounts.cancel')}</button>
<button id="done" disabled>${label('client.shared.done')}</button></div>`;
}
