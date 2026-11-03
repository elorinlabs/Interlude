import { t, useLanguage } from '../i18n';
import { useRef, useState, type ReactNode } from 'react';
import { Copy, Maximize2, X } from 'lucide-react';
import { copyText } from '../components/copyText';

export function ChatMarkdownTable({ children }: { children?: ReactNode }) {
  useLanguage();
  const table = useRef<HTMLTableElement>(null);
  const [expanded, setExpanded] = useState(false);
  const copy = () => {
    const text = Array.from(table.current?.rows ?? [], row =>
      Array.from(row.cells, cell => (cell.textContent ?? '').trim()).join('\t')).join('\n');
    void copyText(t("client.chat.table"), text);
  };
  return <div className="chat-markdown-table">
    <div className="chat-table-viewport" tabIndex={0} role="region" aria-label={t("client.chat.table")}>
      <table ref={table}>{children}</table>
    </div>
    <div className="chat-table-actions">
      <button type="button" aria-label={t("client.chat.expandTable")} onClick={() => setExpanded(true)}><Maximize2 size={14} /></button>
      <button type="button" aria-label={t("client.chat.copyTable")} onClick={copy}><Copy size={14} /></button>
    </div>
    {expanded && <dialog ref={node => { if (node && !node.open) node.showModal(); }}
      className="chat-table-dialog" aria-label={t("client.chat.table")} onCancel={() => setExpanded(false)}>
      <header><strong>{t("client.chat.table")}</strong><button type="button" aria-label={t("client.chat.closeTable")} onClick={() => setExpanded(false)}>
        <X size={18} /></button></header>
      <div className="chat-expanded-table chat-markdown">
        <button type="button" className="chat-text-action" aria-label={t("client.chat.copyTable")} onClick={copy}>
          <Copy size={14} />{t("client.chat.copyTable")}</button>
        <div className="chat-table-viewport" tabIndex={0} role="region" aria-label={t("client.chat.fullTable")}>
          <table>{children}</table>
        </div>
      </div>
    </dialog>}
  </div>;
}
