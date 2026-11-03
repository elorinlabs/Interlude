import { uiText } from "../../../i18n/uiText";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RootContent } from "hast";
import { renderToken } from "../CodeHighlight";
import codeStyles from "../CodeBlock.module.less";
import { fileLanguage } from "./fileLanguages";
import styles from "./preview.module.less";

const MAX_HIGHLIGHT_CHARACTERS = 200_000;
const LINE_HEIGHT = 22;

export function PreviewCode({ text, path, line }: { text: string; path: string; line?: number }) {
  const [nodes, setNodes] = useState<RootContent[] | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const language = fileLanguage(path, text);
  const head = text.slice(0, MAX_HIGHLIGHT_CHARACTERS);
  const tail = text.slice(MAX_HIGHLIGHT_CHARACTERS);
  const lineCount = useMemo(() => text.split("\n").length, [text]);
  const gutter = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1).join("\n"), [lineCount]);
  const selectedLine = line ? Math.min(line, lineCount) : undefined;
  useEffect(() => {
    setNodes(null);
    if (!language || typeof Worker === "undefined") return;
    const worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RootContent[] | null>) => setNodes(event.data);
    worker.postMessage({ text: head, language });
    return () => worker.terminate();
  }, [head, language]);
  useEffect(() => {
    if (scroll.current && selectedLine) scroll.current.scrollTop = Math.max(0, (selectedLine - 4) * LINE_HEIGHT);
  }, [selectedLine, text]);
  return <section className={styles.code}>
    <div className={styles.codeInfo}>
      <span>{language || uiText("client.chat.text")} · {lineCount}  {uiText("client.chat.line")}{line && uiText("client.workspaceActions.line", { value1: line })}</span>
      {tail && <span>{uiText("client.workspaceActions.thisFileIsLongTheRemainingContentIsShownAs")}</span>}
    </div>
    <div className={styles.codeScroll} ref={scroll} tabIndex={0} aria-label={uiText("client.workspaceActions.fileContent")}>
      <div className={styles.codeLines} style={{ lineHeight: `${LINE_HEIGHT}px` }}>
        {selectedLine && <div className={styles.selectedLine} aria-hidden="true"
          style={{ top: (selectedLine - 1) * LINE_HEIGHT, height: LINE_HEIGHT }} />}
        <pre className={styles.gutter} aria-hidden="true">{gutter}</pre>
        <pre className={styles.source}><code className={codeStyles.highlight}>
          {nodes ? nodes.map(renderToken) : head}{tail}
        </code></pre>
      </div>
    </div>
  </section>;
}
