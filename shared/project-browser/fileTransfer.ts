import { fromByteArray, toByteArray } from 'base64-js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { PROJECT_FILE_CHUNK_BYTES, type ProjectBrowserRequest, type ProjectDocument,
  type ProjectFileSave, type ProjectFileTarget } from './protocol';
import { decodeChatUtf8 } from '../remote-chat/utf8';

type Request = <T>(request: ProjectBrowserRequest) => Promise<T>;

/** Chunking keeps large text out of individual IPC/relay messages; the digest rejects torn reads. */
export async function readProjectDocument(request: Request, target: ProjectFileTarget): Promise<ProjectDocument> {
  const document = await request<ProjectDocument>({ operation: 'projectFileRead', ...target });
  if (!document.chunked || document.kind !== 'text') return document;
  const bytes = new Uint8Array(document.size);
  const hash = sha256.create();
  for (let offset = 0; offset < bytes.length; offset += PROJECT_FILE_CHUNK_BYTES) {
    const length = Math.min(PROJECT_FILE_CHUNK_BYTES, bytes.length - offset);
    const reply = await request<{ data: string }>({ operation: 'projectFileRead', ...target, chunk: { offset, length } });
    const chunk = toByteArray(reply.data);
    if (chunk.length !== length) throw new Error('client.projectBrowser.thisFileChangedElsewhereCopyYourEditsBeforeReloadingIt');
    bytes.set(chunk, offset); hash.update(chunk);
  }
  if (bytesToHex(hash.digest()) !== document.revision) {
    throw new Error('client.projectBrowser.thisFileChangedElsewhereCopyYourEditsBeforeReloadingIt');
  }
  return { ...document, text: decodeChatUtf8(bytes), chunked: undefined };
}

/** The host stages chunks and atomically replaces the file only after checking the original revision. */
export async function saveProjectDocument(request: Request, target: ProjectFileSave): Promise<ProjectDocument> {
  const bytes = utf8ToBytes(target.text);
  if (bytes.length <= PROJECT_FILE_CHUNK_BYTES) {
    return request<ProjectDocument>({ operation: 'projectFileWrite', ...target });
  }
  const token = crypto.randomUUID();
  const base = { operation: 'projectFileWrite' as const, cwd: target.cwd, path: target.path, revision: target.revision };
  let finished = false;
  try {
    for (let offset = 0; offset < bytes.length; offset += PROJECT_FILE_CHUNK_BYTES) {
      const end = Math.min(bytes.length, offset + PROJECT_FILE_CHUNK_BYTES);
      const finish = end === bytes.length;
      const reply = await request<ProjectDocument>({ ...base, upload: {
        token, offset, size: bytes.length, data: fromByteArray(bytes.subarray(offset, end)), finish,
      } });
      if (finish) { finished = true; return { ...reply, text: target.text, chunked: undefined }; }
    }
    throw new Error('client.projectBrowser.unableToSaveCheckThatTheFileIsWritableAnd');
  } finally {
    if (!finished) await request({ ...base, upload: { token, offset: 0, size: bytes.length, data: '', cancel: true } })
      .catch(() => console.warn('Project upload cleanup deferred until session expiry'));
  }
}
