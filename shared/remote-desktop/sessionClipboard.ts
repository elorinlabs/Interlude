import type { ClipboardContent, ClipboardProgress } from './clipboard';
import type { DesktopCapabilities } from './protocol';
import type { DesktopReceiver } from './receiver';
import { sendDesktopChord } from './softKeyboard';
import type { FileOffer, FileRead } from './fileClipboard';

/** Older hosts retain native editing; only negotiated hosts may automatically replace their clipboard. */
export function sessionClipboard(receiver: () => Pick<DesktopReceiver, 'clipboard' | 'input'> | undefined,
  capabilities: DesktopCapabilities, sync = true) {
  const current = () => {
    const session = receiver();
    if (!session) throw new Error('请等待桌面连接后重试。');
    return session;
  };
  const sharing = () => {
    if (!capabilities.clipboard) throw new Error(capabilities.control === undefined
      ? '请更新远程电脑上的应用，启用实体键盘和剪贴板。' : '电脑未允许剪贴板操作，请在电脑的设置中调整。');
    return current().clipboard;
  };
  const shortcut = (code: string) => sendDesktopChord(event => current().input(event),
    [capabilities.platform === 'macos' ? 'MetaLeft' : 'ControlLeft', code]);
  return {
    syncEnabled: sync,
    fileStreaming: capabilities.clipboardFiles === true,
    registerFiles: (offer: FileOffer, read: (request: FileRead) => Promise<string>) =>
      sharing().files.register(offer, read),
    readFile: (request: FileRead) => sharing().files.read(request),
    read: (key?: 'copy' | 'cut', progress?: ClipboardProgress, files = false) =>
      files && capabilities.clipboardFiles ? sharing().read(key, progress, true) : sharing().read(key, progress),
    write: (content: ClipboardContent, paste = true, progress?: ClipboardProgress, revision?: string) => {
      if (capabilities.clipboardFiles) {
        if (content.format === 'fileOffer') return sharing().files.publish(content.offer, paste, revision);
        if (content.format === 'files') return sharing().files.writeFiles(content, paste, revision);
      }
      return sharing().write(content, paste, progress, revision);
    },
    copy: async (key: 'copy' | 'cut', progress?: ClipboardProgress, files = false) => {
      if (!sync) { shortcut(key === 'copy' ? 'KeyC' : 'KeyX'); return undefined; }
      if (capabilities.clipboardNative) {
        return files && capabilities.clipboardFiles ? current().clipboard.copy(key, progress, true)
          : current().clipboard.copy(key, progress);
      }
      shortcut(key === 'copy' ? 'KeyC' : 'KeyX');
      return undefined;
    },
    paste: async (preferLocal: boolean) => {
      if (!sync) { shortcut('KeyV'); return undefined; }
      if (capabilities.clipboardNative) return current().clipboard.paste(preferLocal);
      shortcut('KeyV');
      return undefined;
    },
  };
}
