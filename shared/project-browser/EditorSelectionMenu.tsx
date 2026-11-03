import { remoteErrorText } from '../localization/errors';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { redo, redoDepth, selectAll, undo, undoDepth } from '@codemirror/commands';
import { Quote } from 'lucide-react';
import type { BrowserHost } from './entryActions';
import type { BrowserTranslate } from './ProjectTree';
import type { SelectionMenu } from './useEditorSelectionMenu';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus } from './treeMenuNavigation';
import './editorSelection.css';

type EditAction = 'copy' | 'cut' | 'paste' | 'delete' | 'selectAll' | 'undo' | 'redo';

async function editSelection(editor: EditorView, action: EditAction) {
  editor.focus();
  if (action === 'selectAll') { selectAll(editor); return; }
  if (action === 'undo') { undo(editor); return; }
  if (action === 'redo') { redo(editor); return; }
  const original = editor.state;
  if (action === 'copy' || action === 'cut') {
    const { from, to } = editor.state.selection.main;
    // execCommand preserves the host's clipboard integration when the async API is unavailable.
    if (!document.execCommand('copy')) await navigator.clipboard.writeText(editor.state.sliceDoc(from, to));
  }
  if (action === 'copy' || editor.state.readOnly) return;
  const insert = action === 'paste' ? await navigator.clipboard.readText() : '';
  // Clipboard permission prompts may outlive an edit, a read-only transition, or a selection change.
  if (editor.state !== original) throw new Error('操作未完成，请重试。');
  editor.dispatch(editor.state.replaceSelection(insert), { userEvent: action === 'paste' ? 'input.paste' : 'delete.cut' });
}

export function EditorSelectionMenu({ menu, editor, quoteSelection, close, t }: {
  menu: SelectionMenu; editor: EditorView; quoteSelection: NonNullable<BrowserHost['quoteSelection']>;
  close: () => void; t: BrowserTranslate;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (menu.touch) return;
    const rect = element.current?.getBoundingClientRect();
    if (rect) setPosition({
      left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - rect.width - MENU_MARGIN)),
      top: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - rect.height - MENU_MARGIN)),
    });
    focusFirstMenuItem(element.current);
  }, [menu]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close(); editor.focus();
    };
    document.addEventListener('keydown', dismiss, true);
    // The touch action follows the editor as the keyboard resizes it; keep the native selection intact.
    if (!menu.touch) window.addEventListener('resize', close);
    return () => { document.removeEventListener('keydown', dismiss, true); window.removeEventListener('resize', close); };
  }, [close, editor, menu.touch]);
  const quote = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await quoteSelection(menu.selection); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作未完成，请重试。'); }
    finally { setBusy(false); }
  };
  const edit = async (action: EditAction) => {
    try { await editSelection(editor, action); close(); }
    catch { setError(action === 'paste' ? '无法读取剪贴板，请使用粘贴快捷键。' : '操作未完成，请重试。'); }
  };
  const item = (action: EditAction, label: string, disabled = false) =>
    <button type="button" role="menuitem" disabled={busy || disabled} onClick={() => { void edit(action); }}>
      <span>{t(label)}</span></button>;
  const content = <div ref={element} role="menu" aria-label={t("client.projectBrowser.textActions")}
    className={`pf-tree-menu pf-selection-menu${menu.touch ? ' pf-selection-touch' : ''}`}
    style={menu.touch ? undefined : position} onKeyDown={moveMenuFocus}
    onPointerDown={event => event.preventDefault()} onContextMenu={event => event.preventDefault()}>
    <button type="button" role="menuitem" disabled={busy} onClick={() => { void quote(); }}>
      <Quote size={16} /><span>{t("client.projectBrowser.quoteInChat")}</span></button>
    {!menu.touch && <>
      <div role="separator" />
      {item('undo', "client.projectBrowser.undo", editor.state.readOnly || !undoDepth(editor.state))}
      {item('redo', "client.projectBrowser.redo", editor.state.readOnly || !redoDepth(editor.state))}
      <div role="separator" />
      {item('cut', "client.projectBrowser.cut", editor.state.readOnly)}{item('copy', "client.projectBrowser.copied")}
      {item('paste', "client.projectBrowser.paste", editor.state.readOnly)}{item('delete', "client.projectBrowser.deleted", editor.state.readOnly)}
      <div role="separator" />{item('selectAll', "client.projectBrowser.selectAll")}
    </>}
    {error && <p className="pf-selection-error" role="alert">{remoteErrorText(error)}</p>}
  </div>;
  if (menu.touch) return content;
  return <div className="pf-menu-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) { close(); editor.focus(); }
  }}>{content}</div>;
}
