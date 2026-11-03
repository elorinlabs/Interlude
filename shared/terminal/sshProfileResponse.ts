const PROFILE_ERRORS = new Set(['client.ssh.invalid', 'client.ssh.profileChanged', 'client.ssh.profileLimit',
  'client.ssh.signIn', 'client.ssh.syncFailed', 'client.ssh.loadFailed', 'client.ssh.storageFailed',
  'client.ssh.updateRequired', 'client.ssh.credentialsUnavailable']);

/** Only display known, translated errors; server internals and HTTP bodies stay out of the form. */
export function sshProfileError(error: unknown, fallback = 'client.ssh.syncFailed') {
  const message = error instanceof Error ? error.message : error;
  return typeof message === 'string' && PROFILE_ERRORS.has(message) ? message : fallback;
}

export async function sshProfileResponse(response: Response): Promise<unknown> {
  if (response.status === 401 || response.status === 403) throw new Error('client.ssh.signIn');
  if (response.status === 404 || response.status === 405) throw new Error('client.ssh.updateRequired');
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error('client.ssh.syncFailed'); }
  if (response.ok) return body;
  const message = body && typeof body === 'object' && 'message' in body ? body.message : undefined;
  throw new Error(sshProfileError(message));
}
