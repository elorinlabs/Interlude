import { t } from '../i18n';
import { base64Bytes, checkDownloadSize } from '../../../../shared/remote-chat/policy';

export function downloadChatImage(url: string) {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([a-z0-9+/=]+)$/i.exec(url);
  if (!match) throw new Error(t("client.chat.couldNotDownloadTheImagePleaseTryAgain"));
  checkDownloadSize(base64Bytes(url));
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: `image/${match[1]}` }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `CodexSwitch-image.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
