const DOWNLOAD_ONLY_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'apk', 'aab', 'dmg', 'pkg', 'deb', 'rpm', 'zip', '7z', 'rar', 'gz', 'tar', 'bz2', 'xz',
  'iso', 'bin', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);
const MEDIA_PREVIEW_EXTENSIONS = new Set(['pdf', 'mp3', 'wav', 'flac', 'ogg']);

/** Desktop preview streams can also render PDF and media unsupported by the portable preview. */
export function isDownloadOnlyFile(path: string, options: { mediaPreview?: boolean } = {}) {
  const name = path.split(/[\\/]/).at(-1) || '';
  const extension = name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : '';
  return DOWNLOAD_ONLY_EXTENSIONS.has(extension)
    || (!options.mediaPreview && MEDIA_PREVIEW_EXTENSIONS.has(extension));
}
