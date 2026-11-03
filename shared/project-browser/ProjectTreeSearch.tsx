import { Search, X } from 'lucide-react';
import { useRef } from 'react';
import { PROJECT_SEARCH_QUERY_LIMIT } from './protocol';
import type { BrowserTranslate } from './ProjectTree';
import type { useProjectTreeSearch } from './useProjectTreeSearch';
import './treeSearch.css';

export function ProjectTreeSearch({ query, disabled, change, t }: {
  query: string; disabled: boolean; change: (value: string) => void; t: BrowserTranslate;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="pf-tree-search" role="search" aria-label={t("client.projectBrowser.searchFilesOrFolders")}>
    <Search size={15} aria-hidden="true" />
    <input ref={input} type="search" value={query} disabled={disabled} maxLength={PROJECT_SEARCH_QUERY_LIMIT}
      placeholder={t("client.projectBrowser.searchFilesOrFolders")} aria-label={t("client.projectBrowser.searchFilesOrFolders")} autoComplete="off" spellCheck={false}
      onChange={event => change(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); change(''); }
      }} />
    {query && <button type="button" aria-label={t("client.projectBrowser.clearSearch")} onClick={() => { change(''); input.current?.focus(); }}>
      <X size={14} /></button>}
  </div>;
}

export function ProjectTreeSearchNotice({ search, t }: {
  search: ReturnType<typeof useProjectTreeSearch>; t: BrowserTranslate;
}) {
  if (search.loading) return <p className="pf-notice" role="status">{t("client.projectBrowser.searching")}</p>;
  if (search.failed) return <div className="pf-notice" role="alert">{t("client.projectBrowser.unableToSearchFilesPleaseTryAgain")}
    <button type="button" onClick={search.refresh}>{t("client.terminal.retry")}</button></div>;
  return <>
    {!search.entries.length && <p className="pf-notice" role="status">{t("client.projectBrowser.noMatchingFilesOrFolders")}</p>}
    {search.truncated && <p className="pf-notice" role="status">{t("client.projectBrowser.onlySomeResultsAreShownEnterAMoreSpecificName")}</p>}
  </>;
}
