import type { LoungeSession } from './types';

export const AUTH_TIMEOUT_MS = 15_000;

export async function authorize(session: LoungeSession) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([session.authorize(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('client.lounge.unavailable')), AUTH_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}
