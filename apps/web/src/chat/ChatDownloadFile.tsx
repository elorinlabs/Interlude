import { File, Package } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { FileDownloadButton } from '../downloads/FileDownloadButton';
import { t } from '../i18n';
import type { FilePreviewContext } from './ChatFilePreview';
import './filePreview.css';

export { isDownloadOnlyFile } from '../../../../shared/remote-chat/filePreview';
const INSTALLER_FILE = /\.(?:exe|msi|msix|apk|aab|dmg|pkg|deb|rpm)$/i;

export function ChatDownloadFile({ path, context, onClose }: {
  path: string; context: FilePreviewContext; onClose: () => void;
}) {
  const name = path.split(/[\\/]/).at(-1) || t("client.chat.files.39932f");
  const extension = name.split('.').at(-1)?.toUpperCase() || '';
  const Icon = INSTALLER_FILE.test(path) ? Package : File;
  return <AdaptiveSheet open title={t("client.downloads.fileDownload")} width={448} className="chat-download-sheet" onClose={onClose}>
    <div className="chat-download-file">
      <div className="chat-download-file-heading">
        <div className="chat-download-file-icon"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></div>
        <div className="chat-download-file-info"><h3>{name}</h3>
          <span className="chat-download-file-type">{extension}</span></div>
      </div>
      <p className="chat-download-file-hint">{t("client.mobile.downloadTheFileToOpenItInACompatibleApp")}</p>
      <div className="chat-download-file-transfer"><FileDownloadButton path={path} context={context} /></div>
    </div>
  </AdaptiveSheet>;
}
