import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { mathOptions, normalizeMathDelimiters } from '../chat/mathMarkdown';
import { CodeBlock } from '../../apps/desktop/src/pages/codexGui/CodeBlock';
import { MarkdownTable } from '../../apps/desktop/src/pages/codexGui/MarkdownTable';
import styles from '../../apps/desktop/src/pages/codexGui/styles.module.less';
import 'katex/dist/katex.min.css';
import { previewReference } from '../../apps/desktop/src/pages/codexGui/filePreview/references';
import { BrowserPreviewImage } from './BrowserPreviewImage';
import type { PreviewLoader } from './kinds';

export function BrowserMarkdown({ text, path, load, openFile }: {
  text: string; path: string; load: PreviewLoader; openFile: (path: string) => void;
}) {
  return <article className={`browser-markdown ${styles.markdown}`}>
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]} rehypePlugins={[[rehypeKatex, mathOptions]]}
      skipHtml urlTransform={value => previewReference(value, path) ? value : defaultUrlTransform(value)} components={{
        a: ({ href, children }) => {
          const file = href ? previewReference(href, path) : undefined;
          if (file) return <button className="browser-preview-link" type="button"
            onClick={() => openFile(file.path)}>{children}</button>;
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
        img: ({ src, alt }) => <BrowserPreviewImage src={src} alt={alt} path={path} load={load} />,
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
      }}>{normalizeMathDelimiters(text)}</Markdown>
  </article>;
}
