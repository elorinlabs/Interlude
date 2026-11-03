import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Copy, Download, FilePlus, FolderOpen, FolderPlus,
  Scissors, ClipboardPaste, Pencil, Trash2, Terminal, Link, Quote } from 'lucide-react';
import type { BrowserHost } from './entryActions';
import { normalizedPath } from './entryActions';
import type { TreeCommand, TreeMenu as Menu } from './useTreeActions';
import type { BrowserTranslate } from './ProjectTree';
import { TreeSubmenu } from './TreeSubmenu';
import { useTreeMenuDismiss } from './useTreeMenuDismiss';
import { focusFirstMenuItem, MENU_MARGIN, moveMenuFocus, SUBMENU_GAP } from './treeMenuNavigation';

export function TreeMenu({ menu, host, canPaste, cwd, close, command, t, children, extraItems }: {
  menu: Menu; host: BrowserHost; canPaste: boolean; cwd: string; close: () => void;
  command: (action: TreeCommand) => void; t: BrowserTranslate; children?: ReactNode; extraItems?: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  useTreeMenuDismiss(element, close);
  const [submenu, setSubmenu] = useState<'new'>();
  const [compact, setCompact] = useState(false);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  const stackedSubmenu = compact ? submenu : undefined;
  const root = normalizedPath(menu.entry.path) === normalizedPath(cwd);
  const supports = (action: 'copy' | 'move') => !host.entryActions || host.entryActions.includes(action);
  useLayoutEffect(() => {
    const positionMenu = () => {
      const rect = element.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - rect.width - MENU_MARGIN)),
        top: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - rect.height - MENU_MARGIN)),
      });
      setCompact(window.innerWidth < rect.width * 2 + MENU_MARGIN * 2 + SUBMENU_GAP);
    };
    const resize = () => { setSubmenu(undefined); positionMenu(); };
    positionMenu();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [menu, stackedSubmenu]);
  useLayoutEffect(() => { focusFirstMenuItem(element.current); }, [menu, stackedSubmenu]);
  const item = (action: TreeCommand, label: string, Icon: typeof Copy, disabled = false) =>
    <button key={action} type="button" role="menuitem" disabled={disabled}
      className={action === 'delete' ? 'pf-danger' : undefined} onClick={() => command(action)}>
      <Icon size={16} /><span>{t(label)}</span></button>;
  const newItems = <>{item('createFile', "client.projectBrowser.newFile", FilePlus)}{item('createFolder', "client.projectBrowser.newFolder", FolderPlus)}</>;
  const clearOtherSubmenu = (target: EventTarget) => {
    const button = (target as HTMLElement).closest('button');
    if (button?.closest('[role="menu"]') === element.current && !button.hasAttribute('aria-haspopup')) {
      setSubmenu(undefined);
    }
  };
  return <div className="pf-menu-backdrop pf-tree-menu-layer" onContextMenu={event => event.preventDefault()}>
    <div ref={element} role="menu" aria-label={t("client.projectBrowser.fileActions")} className="pf-tree-menu" style={position}
      onPointerOver={event => {
        if (event.pointerType === 'mouse' && !compact) clearOtherSubmenu(event.target);
      }} onFocus={event => { if (!compact) clearOtherSubmenu(event.target); }}
      onScroll={() => { if (!compact) setSubmenu(undefined); }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'ArrowLeft') {
          event.preventDefault(); event.stopPropagation();
          if (submenu) setSubmenu(undefined); else close();
        }
        moveMenuFocus(event);
      }}>
      {stackedSubmenu && <button type="button" role="menuitem" onClick={() => setSubmenu(undefined)}>
        <ArrowLeft size={16} /><span>{t("client.mobile.back")}</span></button>}
      {stackedSubmenu === 'new' && newItems}
      {!stackedSubmenu && <>
        {item('reference', "client.projectBrowser.referenceFile", Quote, !host.reference)}
        {menu.entry.directory && <TreeSubmenu label={t("client.projectBrowser.new")} icon={FilePlus} active={submenu === 'new'}
          compact={compact} open={() => setSubmenu('new')}
          close={() => setSubmenu(current => current === 'new' ? undefined : current)}>{newItems}</TreeSubmenu>}
        {item('cut', "client.projectBrowser.cut", Scissors, root || !supports('move'))}
        {item('copy', "client.projectBrowser.copied", Copy, root || !supports('copy'))}
        {item('copyPath', "client.composer.copyPath", Link)}
        {menu.entry.directory && item('paste', "client.projectBrowser.paste", ClipboardPaste, !canPaste)}
        <div role="separator" />
        {item('rename', "client.projectBrowser.renamed", Pencil, root)}{item('delete', "client.projectBrowser.deleted", Trash2, root)}
        <div role="separator" />
        {host.open && item('explorer', "client.projectBrowser.openInExplorer", FolderOpen)}
        {host.openTerminal && item('terminal', "client.projectBrowser.openInTerminal", Terminal)}
        {!host.open && item('download', menu.entry.directory
          ? "client.projectBrowser.downloadAsZip" : "client.projectBrowser.download", Download,
        !host.download || (menu.entry.directory && host.downloadDirectory === false))}
        {(extraItems || (root && children)) && <><div role="separator" />{extraItems}{root && children}</>}
      </>}
    </div>
  </div>;
}
