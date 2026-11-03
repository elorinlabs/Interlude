import type { UpdatePeerSession } from './peerLookup';

export interface DownloadReport {
  id: string;
  artifact: string;
  platform: 'windows' | 'macos' | 'linux' | 'android';
  outcome: 'success' | 'failed';
  peerBytes: number;
  serverBytes: number;
  originBytes: number;
  failures: { source: string; stage: string; code: string; count: number }[];
}

/** Retries use the same ID and captured session; reporting never changes the download result. */
export async function reportDownload(session: UpdatePeerSession, report: DownloadReport): Promise<void> {
  const url = `${session.baseUrl.replace(/\/+$/, '')}/update-sharing/reports`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(report) });
      if (response.ok) return;
      if (response.status < 500 && response.status !== 429) break;
    } catch { /* A transient network failure may succeed on the next attempt. */ }
    finally { clearTimeout(timer); }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  console.warn('Download statistics could not be reported');
}
