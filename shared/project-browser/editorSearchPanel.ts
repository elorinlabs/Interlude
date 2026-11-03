import { type EditorView, type Panel, type ViewUpdate, runScopeHandlers } from '@codemirror/view';
import {
  findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, selectMatches, setSearchQuery,
} from '@codemirror/search';
import type { BrowserTranslate } from './ProjectTree';
import { searchButton, searchElement, searchIcon, searchInput } from './editorSearchControls';
import './editorSearchPanel.css';

const MATCH_LIMIT = 10_000;
type SearchOption = 'caseSensitive' | 'wholeWord' | 'regexp';

/** A shared find panel whose replacement controls only open through the disclosure button. */
export class EditorSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly findField: HTMLInputElement;
  private readonly replaceField: HTMLInputElement;
  private readonly disclosure: HTMLButtonElement;
  private readonly replaceRow: HTMLElement;
  private readonly count = searchElement('pf-search-count');
  private readonly options = new Map<SearchOption, HTMLButtonElement>();
  private readonly searchActions: HTMLButtonElement[] = [];
  private readonly replaceActions: HTMLButtonElement[] = [];
  private query: SearchQuery;
  private expanded = false;
  private matches: { from: number; to: number }[] = [];
  private limited = false;

  constructor(private readonly view: EditorView, t: BrowserTranslate) {
    this.query = getSearchQuery(view.state);
    this.findField = searchInput('search', t('client.projectBrowser.find'));
    this.findField.setAttribute('main-field', 'true');
    this.replaceField = searchInput('replace', t('client.projectBrowser.replace'));
    this.disclosure = searchButton({ label: t('client.projectBrowser.replace'), content: searchIcon('chevron'),
      className: 'pf-search-disclosure', run: () => this.toggleReplace() });
    this.count.setAttribute('role', 'status');
    this.count.setAttribute('aria-label', t('client.projectBrowser.currentMatch'));
    const field = searchElement('pf-search-field', searchIcon('search'), this.findField,
      this.option('caseSensitive', 'Aa', t('client.projectBrowser.matchCase')),
      this.option('wholeWord', 'ab', t('client.projectBrowser.wholeWords')),
      this.option('regexp', '.*', t('client.projectBrowser.regularExpression')));
    const actions = searchElement('pf-search-actions', this.count,
      this.action(t('client.projectBrowser.previous'), findPrevious, searchIcon('previous')),
      this.action(t('client.projectBrowser.next'), findNext, searchIcon('next')),
      this.action(t('client.projectBrowser.selectAll'), selectMatches));
    const findRow = searchElement('pf-search-row', this.disclosure, field, actions);
    this.replaceRow = this.createReplaceRow(t);
    this.dom = searchElement('cm-search pf-search-panel', findRow, this.replaceRow);
    this.dom.addEventListener('keydown', event => this.keydown(event));
    this.findField.addEventListener('input', () => this.commit({ search: this.findField.value }));
    this.replaceField.addEventListener('input', () => this.commit({ replace: this.replaceField.value }));
    this.syncQuery();
    this.countMatches();
    this.refresh();
  }

  private createReplaceRow(t: BrowserTranslate) {
    const replace = searchButton({ label: t('client.projectBrowser.replace'), className: 'pf-search-replace',
      run: () => { replaceNext(this.view); } });
    const all = searchButton({ label: t('client.projectBrowser.replaceAll'), run: () => { replaceAll(this.view); } });
    this.replaceActions.push(replace, all);
    return searchElement('pf-search-row pf-replace-row', searchElement('pf-replace-icon', searchIcon('replace')),
      searchElement('pf-search-field', this.replaceField), searchElement('pf-search-actions', replace, all));
  }

  private option(name: SearchOption, symbol: string, label: string) {
    const button = searchButton({ label, content: symbol, className: `pf-search-option pf-search-${name}`,
      run: () => this.commit({ [name]: !this.query[name] }) });
    this.options.set(name, button);
    return button;
  }

  private action(label: string, run: (view: EditorView) => boolean, content?: Node) {
    const button = searchButton({ label, content, run: () => { run(this.view); } });
    this.searchActions.push(button);
    return button;
  }

  private toggleReplace() {
    if (this.view.state.readOnly) return;
    this.expanded = !this.expanded;
    this.refresh();
    this.view.requestMeasure();
  }

  private commit(change: Partial<Pick<SearchQuery, 'search' | 'replace' | SearchOption>>) {
    const query = new SearchQuery({ ...this.query, ...change });
    if (query.eq(this.query)) return;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
    // Keep the current match when possible, without moving focus out of the input.
    const { from, to } = this.view.state.selection.main;
    if (!('replace' in change) && query.valid && !this.matches.some(match => match.from === from && match.to === to)) {
      findNext(this.view);
    }
  }

  private syncQuery() {
    this.findField.value = this.query.search;
    this.replaceField.value = this.query.replace;
    for (const [name, button] of this.options) button.setAttribute('aria-pressed', String(this.query[name]));
    this.findField.setAttribute('aria-invalid', String(!!this.query.search && !this.query.valid));
  }

  private countMatches() {
    this.matches = [];
    this.limited = false;
    if (!this.query.valid) return;
    const cursor = this.query.getCursor(this.view.state);
    for (let result = cursor.next(); !result.done; result = cursor.next()) {
      if (this.matches.length === MATCH_LIMIT) { this.limited = true; break; }
      this.matches.push(result.value);
    }
  }

  private refresh() {
    const { from, to } = this.view.state.selection.main;
    const current = this.matches.findIndex(match => match.from === from && match.to === to) + 1;
    this.count.textContent = `${current} / ${this.matches.length}${this.limited ? '+' : ''}`;
    const readOnly = this.view.state.readOnly;
    this.disclosure.disabled = readOnly;
    this.disclosure.setAttribute('aria-expanded', String(this.expanded && !readOnly));
    this.replaceRow.hidden = !this.expanded || readOnly;
    for (const button of this.searchActions) button.disabled = !this.matches.length;
    for (const button of this.replaceActions) button.disabled = readOnly || !this.matches.length;
  }

  private keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (runScopeHandlers(this.view, event, 'search-panel')) { event.preventDefault(); return; }
    if (event.key !== 'Enter') return;
    if (event.target === this.findField) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(this.view);
    } else if (event.target === this.replaceField) {
      event.preventDefault();
      replaceNext(this.view);
    }
  }

  update(update: ViewUpdate) {
    const query = getSearchQuery(update.state);
    const changed = !query.eq(this.query);
    if (changed) { this.query = query; this.syncQuery(); }
    if (changed || update.docChanged) this.countMatches();
    this.refresh();
  }

  mount() { this.findField.select(); }
}
