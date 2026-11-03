export const MAX_CHAT_IMAGES = 8;
export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY = 0.8;
// Leave room in the 8 MiB transport envelope for text, settings and RPC metadata.
export const MAX_CHAT_IMAGE_CHARS = 6 * 1024 * 1024;
export interface DraftImage { id: string; url: string }
export class ChatImageError extends Error {}
let nextImageId = 0;

export function chatImageCharLimit(mode?: ConnectionMode) {
  return isDirectChat(mode) ? Number.MAX_SAFE_INTEGER : MAX_CHAT_IMAGE_CHARS;
}

export function validateChatImages(images: readonly string[], mode?: ConnectionMode) {
  if (images.length > MAX_CHAT_IMAGES) {
    throw new ChatImageError(translateMessage(getInterfaceLanguage(), "client.chat.youCanAddUpToImagesAtATime",
      { value1: MAX_CHAT_IMAGES }));
  }
  if (images.reduce((total, image) => total + image.length, 0) > chatImageCharLimit(mode)) {
    throw new ChatImageError('图片较大，请减少图片后再发送。');
  }
  if (images.some((image) => !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))) {
    throw new ChatImageError('图片无法读取，请重新选择。');
  }
}

export function draftImage(url: string): DraftImage {
  validateChatImages([url]);
  return { id: `photo-${++nextImageId}`, url };
}
import { isDirectChat } from './policy';
import type { ConnectionMode } from './protocol';
import { getInterfaceLanguage } from "../localization/interfaceLanguage";
import { translateMessage } from "../localization/messages";
