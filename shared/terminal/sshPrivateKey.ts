export const MAX_PRIVATE_KEY_BYTES = 64 * 1024;

const PRIVATE_KEY_ENVELOPE = /^-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----\r?\n[\s\S]+\r?\n-----END \1-----$/;

/** Read only bounded text files; validation accepts encrypted PEM and OpenSSH containers. */
export async function readSshPrivateKey(file: Pick<File, 'size' | 'text'>): Promise<string> {
  if (file.size > MAX_PRIVATE_KEY_BYTES) throw new Error('client.ssh.keyFileTooLarge');
  let text: string;
  try { text = await file.text(); }
  catch { throw new Error('client.ssh.keyFileReadFailed'); }
  const key = text.trim();
  if (!key) throw new Error('client.ssh.keyFileEmpty');
  if (!PRIVATE_KEY_ENVELOPE.test(key)) throw new Error('client.ssh.keyFileInvalid');
  return key;
}
