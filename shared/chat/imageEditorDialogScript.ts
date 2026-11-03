// In-page dialogs also work in native WebViews that do not provide browser prompt/color pickers.
// Explicit button actions work without granting form submission permission to the browser iframe.
export const imageEditorDialogScript = String.raw`
const textDialog = document.querySelector('#text-dialog');
const textValue = document.querySelector('#text-value');
const colorDialog = document.querySelector('#color-dialog');
const colorValue = document.querySelector('#color-value');
const channels = Array.from(document.querySelectorAll('[data-channel]'));
let textStroke = null;

function openText(stroke) {
  textStroke = stroke;
  textValue.value = '';
  textDialog.showModal();
  textValue.focus();
}
document.querySelector('#text-add').addEventListener('click', () => {
  const text = textValue.value.trim();
  if (!text || !textStroke) { textValue.focus(); return; }
  strokes.push({ ...textStroke, text });
  undone.length = 0;
  textDialog.close();
  render();
});
textDialog.addEventListener('close', () => { textStroke = null; });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  document.getElementById(button.dataset.close).close();
}));
function previewColor(value) {
  colorValue.value = value;
  document.querySelector('#color-preview').style.background = value;
  channels.forEach((channel, index) => { channel.value = parseInt(value.slice(index * 2 + 1, index * 2 + 3), 16); });
}
document.querySelector('#custom-color').addEventListener('click', () => {
  previewColor(color);
  colorDialog.showModal();
});
channels.forEach(channel => channel.addEventListener('input', () => {
  previewColor('#' + channels.map(input => Number(input.value).toString(16).padStart(2, '0')).join(''));
}));
colorValue.addEventListener('input', () => {
  if (/^#[0-9a-f]{6}$/i.test(colorValue.value)) previewColor(colorValue.value);
});
document.querySelector('#color-apply').addEventListener('click', () => {
  if (!colorValue.reportValidity()) return;
  color = colorValue.value;
  selectButton('#colors button', document.querySelector('#custom-color'));
  document.querySelector('#custom-color .swatch').style.background = color;
  colorDialog.close();
});
`;
