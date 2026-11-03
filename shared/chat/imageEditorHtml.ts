import { defaultText, type MessageKey } from '../localization/messages';
import { validateChatImages } from '../remote-chat/attachments';
import type { ConnectionMode } from '../remote-chat/protocol';
import { getChatPolicy, KIB } from '../remote-chat/policy';
import { imageEditorControls, imageEditorDialogs } from './imageEditorControls';
import { imageEditorIcon } from './imageEditorIcons';
import { imageEditorScript } from './imageEditorScript';
import { imageEditorStyles } from './imageEditorStyles';
import { imageEditorDesktop } from './imageEditorDesktop';
import { imageEditorDesktopStyles } from './imageEditorDesktopStyles';
import type { ThemeMode } from '../theme/mode';

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

interface ImageEditorOptions { scriptUrl?: string; mode?: ConnectionMode; themeMode?: ThemeMode }

/** A local canvas editor shared by desktop, phone WebView and browser. No remote images are loaded. */
export function imageEditorHtml(dataUrl: string, translate = defaultText, language = 'zh-CN',
  { scriptUrl, mode, themeMode = 'light' }: ImageEditorOptions = {}) {
  validateChatImages([dataUrl], mode);
  const policy = getChatPolicy(mode);
  const label = (text: MessageKey) => escapeHtml(translate(text));
  const config = JSON.stringify({ dataUrl, desktop: !!scriptUrl, targetBytes: policy.imageTargetKb * KIB,
    maxEdge: policy.imageMaxEdge, labels: {
      saving: translate("client.projectBrowser.saving"),
      saveFailed: translate("client.shared.couldNotSaveUndoSomeAnnotationsAndTryAgain"),
      unavailable: translate("client.shared.couldNotEditThisImageOpenItAgainToRetry"),
      hint: translate("client.shared.drawOnTheImageThenSelectDone"),
      textHint: translate("client.shared.tapTheImageToAddText"),
      eraserHint: translate("client.shared.dragToEraseAnnotationsTheOriginalStaysIntact"),
      panHint: translate("client.shared.dragToMoveTheImageChooseAToolToKeep"),
      readFailed: translate("client.shared.couldNotReadTheImagePleaseChooseItAgain"),
    } }).replace(/</g, '\\u003c');
  const locale = /^ja(?:-|$)/i.test(language) ? 'ja' : /^ru(?:-|$)/i.test(language) ? 'ru' : /^en(?:-|$)/i.test(language) ? 'en' : 'zh-CN';
  return `<!doctype html><html lang="${locale}" data-theme="${themeMode === 'dark' ? 'dark' : 'light'}">
<head><meta charset="utf-8">
<meta name="viewport"
  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:;
  script-src ${scriptUrl ? "'self'" : "'unsafe-inline'"}; style-src 'unsafe-inline'">
<style>${imageEditorStyles}${scriptUrl ? imageEditorDesktopStyles : ''}</style></head>
<body${scriptUrl ? ' data-browser-editor data-desktop-editor' : ''}>
${scriptUrl ? imageEditorDesktop(label) : `<header><button id="cancel">${imageEditorIcon('cancel')}${label("client.accounts.cancel")}</button>
<div class="heading"><h1>${label("client.chat.annotateImage.46176b")}</h1><p>${label("client.shared.highlightWhatMatters")}</p></div>
<button id="done" disabled>${imageEditorIcon('done')}${label("client.shared.done")}</button></header>
<main id="stage"><canvas id="canvas" aria-label="${label("client.shared.imageAnnotationCanvas")}"></canvas></main>
${imageEditorControls(label)}`}${imageEditorDialogs(label)}
${scriptUrl
    ? `<script type="application/json" id="image-editor-config">${config}</script>
<script src="${escapeHtml(scriptUrl)}"></script>`
    : `<script>const config = ${config};${imageEditorScript}</script>`}</body></html>`;
}

export function editedImageMessage(raw: string, mode?: ConnectionMode): string | null {
  const message: unknown = JSON.parse(raw);
  if (!message || typeof message !== 'object' || !('type' in message)) return null;
  if (message.type !== 'save' || !('dataUrl' in message) || typeof message.dataUrl !== 'string') return null;
  validateChatImages([message.dataUrl], mode);
  return message.dataUrl;
}
