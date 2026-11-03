/** Derive a byte source from the configured server while keeping the official URL as the package identity. */
export function updateMirrorUrl(baseUrl: string, officialUrl: string): string | undefined {
  try {
    const source = new URL(officialUrl);
    const base = new URL(baseUrl);
    const path = /^\/piperhex\/remoteai\/releases\/download\/(v?\d+\.\d+\.\d+)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,199})$/
      .exec(source.pathname);
    if (source.origin !== 'https://github.com' || source.search || source.hash || source.username || source.password
      || !path || base.protocol !== 'https:' || base.username || base.password) return undefined;
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/update-packages/${path[1]}/${path[2]}`;
    base.search = ''; base.hash = '';
    return base.toString();
  } catch { return undefined; }
}
