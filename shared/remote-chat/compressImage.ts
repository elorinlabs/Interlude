import { getChatPolicy, isDirectChat, KIB, type ChatPolicy } from './policy';
import { getInterfaceLanguage } from "../localization/interfaceLanguage";
import { translateMessage } from "../localization/messages";

const QUALITIES = [0.8, 0.65, 0.5];
const MIN_EDGE = 128;
export class ImagePolicyError extends Error {}

/** Reduce quality, then dimensions, until the encoded file satisfies the configured byte target. */
export async function compressChatImage<T>(
  encode: (edge: number, quality: number) => Promise<{ value: T; bytes: number }>,
  policy: ChatPolicy = getChatPolicy(),
  transportBytes = Infinity,
): Promise<T> {
  // A larger configured target must still fit a single chat message.
  const targetBytes = Math.min(policy.imageTargetKb * KIB, transportBytes);
  if (isDirectChat()) {
    return (await encode(policy.imageMaxEdge, 1)).value;
  }
  let edge = policy.imageMaxEdge;
  while (edge >= MIN_EDGE) {
    for (const quality of QUALITIES) {
      const result = await encode(edge, quality);
      if (result.bytes <= targetBytes) return result.value;
    }
    edge = Math.floor(edge / 2);
  }
  throw new ImagePolicyError(translateMessage(getInterfaceLanguage(), "client.runtimeErrors.couldNotCompressTheImageToKbChooseADifferent",
    { value1: policy.imageTargetKb }));
}
