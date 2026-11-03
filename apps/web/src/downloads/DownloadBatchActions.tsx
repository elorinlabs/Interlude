import { displayText } from '../i18n';

export function DownloadBatchActions({ count, total, allSelected, busy, toggleAll, remove, text = displayText }: {
  count: number; busy: boolean; remove: () => void; text?: typeof displayText;
  total: number; allSelected: boolean; toggleAll: () => void;
}) {
  return <div className="download-batch-actions">
    <button type="button" className="download-text-action" disabled={!total || busy} onClick={toggleAll}>
      {text(allSelected ? 'client.downloads.deselectAll' : 'client.downloads.selectAll')}
    </button>
    <button type="button" className="download-text-action download-danger" disabled={!count || busy} onClick={remove}>
      {count ? text('client.downloads.deleteSelectedCount', { count }) : text('client.downloads.deleteSelected')}
    </button>
  </div>;
}
