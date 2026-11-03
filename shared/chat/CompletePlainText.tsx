const TEXT_NODE_CHARACTERS = 10_000;

/** Small text nodes keep complete large logs readable without parsing or paging. */
export function CompletePlainText({ text }: { text: string }) {
  return Array.from({ length: Math.ceil(text.length / TEXT_NODE_CHARACTERS) }, (_, index) => (
    <span key={index}>{text.slice(index * TEXT_NODE_CHARACTERS, (index + 1) * TEXT_NODE_CHARACTERS)}</span>
  ));
}
