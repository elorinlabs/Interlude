import type { ClipboardContent } from './clipboard';

function sameContent(left: ClipboardContent, right: ClipboardContent) {
  if (left.format === 'fileOffer' && right.format === 'fileOffer') return left.offer.id === right.offer.id;
  if (left.format === 'text' && right.format === 'text') return left.text === right.text;
  if (left.format === 'image' && right.format === 'image') return left.data === right.data;
  if (left.format !== 'files' || right.format !== 'files' || left.files.length !== right.files.length) return false;
  return left.files.every((file, index) => file.name === right.files[index].name && file.data === right.files[index].data);
}

/** Remember what the viewer last observed locally; unchanged data must never replace native remote formats. */
export class ClipboardOrigin {
  private remote = false;
  private local?: ClipboardContent;

  remember(local?: ClipboardContent) { this.remote = true; this.local = local; }
  reset() { this.remote = false; this.local = undefined; }
  preferLocal(content: ClipboardContent | undefined) {
    if (!content) return false;
    if (!this.remote) return true;
    // Without a local baseline, preserving remote content is safer than importing an unknown old clipboard.
    return !!this.local && !sameContent(this.local, content);
  }
}
