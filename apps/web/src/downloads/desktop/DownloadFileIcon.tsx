import { File, FileArchive, FileCode2, FileImage, FileText, Package } from 'lucide-react';

function fileAppearance(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  if (['zip', '7z', 'rar', 'gz', 'tar', 'bz2'].includes(extension)) return { Icon: FileArchive, tone: 'archive' };
  if (['msi', 'exe', 'dmg', 'pkg', 'deb', 'rpm', 'apk'].includes(extension)) return { Icon: Package, tone: 'package' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(extension)) {
    return { Icon: FileImage, tone: 'image' };
  }
  if (['ts', 'tsx', 'js', 'json', 'rs', 'go', 'patch', 'diff'].includes(extension)) {
    return { Icon: FileCode2, tone: 'document' };
  }
  if (['md', 'txt', 'pdf', 'doc', 'docx', 'csv'].includes(extension)) return { Icon: FileText, tone: 'document' };
  return { Icon: File, tone: 'generic' };
}

export function DownloadFileIcon({ name }: { name: string }) {
  const { Icon, tone } = fileAppearance(name);
  return <span className={`dw-file-icon dw-file-icon-${tone}`} aria-hidden><Icon size={29} strokeWidth={1.8} /></span>;
}
