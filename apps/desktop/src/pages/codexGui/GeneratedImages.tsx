import { uiText } from "../../i18n/uiText";
import type { Item } from "./types";
import { generatedImageSource } from "./imageSources";
import { MessageImage } from "./MessageImage";

export function GeneratedImages({ items }: { items: Item[] }) {
  const sources = new Set<string>();
  for (const item of items) {
    if (item.type !== "imageGeneration" || item.status !== "completed" || item.failure) continue;
    const source = generatedImageSource(item);
    if (source) sources.add(source);
  }
  if (!sources.size) return null;
  return <div aria-label={uiText("client.chat.generatedImage")}>
    {[...sources].map((source, index) => <MessageImage key={source} src={source} alt={uiText("client.composer.generatedImage", { value1: index + 1 })} />)}
  </div>;
}
