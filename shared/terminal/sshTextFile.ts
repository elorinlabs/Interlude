import { utf8ToBytes } from '@noble/hashes/utils';
import { fromByteArray, toByteArray } from 'base64-js';
import { decodeChatUtf8 } from '../remote-chat/utf8';
import type { SshUpload } from './sshTransfers';

export interface SshTextContent {
  text: string;
  bom: boolean;
  newline: '\n' | '\r\n' | '\r';
}

/** Decode content, rather than guessing from its extension, so dotfiles and extensionless scripts also open. */
export function decodeSshText(data: string): SshTextContent | undefined {
  const bytes = toByteArray(data);
  // Tabs, line breaks and form feeds are valid text; other control bytes indicate binary content.
  if (bytes.some(byte => (byte < 32 && ![9, 10, 12, 13].includes(byte)) || byte === 127)) return;
  let source: string;
  try { source = decodeChatUtf8(bytes); }
  catch { return; }
  const bom = source.startsWith('\uFEFF');
  if (bom) source = source.slice(1);
  const newline = source.match(/\r\n|\r|\n/)?.[0] as SshTextContent['newline'] | undefined;
  return { text: source.replace(/\r\n|\r/g, '\n'), bom, newline: newline ?? '\n' };
}

/** UI text inputs normalize line endings. Restore the source format before uploading edited content. */
export function sshTextUpload(name: string, content: SshTextContent): SshUpload {
  const text = content.text.replace(/\r\n|\r|\n/g, content.newline);
  const bytes = utf8ToBytes(`${content.bom ? '\uFEFF' : ''}${text}`);
  return { name, size: bytes.length,
    read: async (offset, length) => fromByteArray(bytes.subarray(offset, offset + length)) };
}
