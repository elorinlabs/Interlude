import { isFileReference } from './fileReference';

export interface MessageAttachment { kind: 'file' | 'folder'; name: string; path: string }
interface Mention { name?: string; path?: string }
const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\/(?!\/)|\\\\[^\\]+\\)/i;
// These labels are the existing attachment wire format, independent of the UI language.
const ATTACHMENT_LINE = /^(文件|文件夹)：[\t ]*(.+?)\s*$/u;

function attachmentName(path: string) {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || path;
}

function splitAttachmentLines(source: string) {
  const attachments: MessageAttachment[] = [];
  const lines: string[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const line of source.split(/\r\n?|\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (delimiter) {
      if (!fence) fence = { marker: delimiter[1][0], length: delimiter[1].length };
      else if (delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2].trim()) {
        fence = undefined;
      }
      lines.push(line);
      continue;
    }
    const match = !fence && line.match(ATTACHMENT_LINE);
    if (!match || !ABSOLUTE_PATH.test(match[2]) || /[\x00-\x1f\x7f]/u.test(match[2])) {
      lines.push(line);
      continue;
    }
    const path = match[2];
    attachments.push({ kind: match[1] === '文件夹' ? 'folder' : 'file', name: attachmentName(path), path });
  }
  return { text: attachments.length ? lines.join('\n').replace(/^\n+|\n+$/g, '') : source, attachments };
}

/** Decode display-only attachments from both acknowledged mentions and joined historical text. */
export function messageAttachments<T extends Mention>(source: string, mentions: readonly T[] = []) {
  const parsed = splitAttachmentLines(source);
  const attachments = new Map(parsed.attachments.map(file => [file.path, file]));
  const references: T[] = [];
  for (const mention of mentions) {
    const path = mention.path ?? '';
    if (!(path ? isFileReference(path) || ABSOLUTE_PATH.test(path) : mention.name)) {
      references.push(mention);
      continue;
    }
    const key = path || `upload:${mention.name}`;
    attachments.set(key, { kind: attachments.get(key)?.kind ?? 'file', path,
      name: mention.name || attachmentName(path) });
  }
  return { text: parsed.text, attachments: [...attachments.values()], references };
}
