import { t, useLanguage } from '../i18n';
import { useEffect, type ReactNode } from 'react';
import { Drawer } from 'antd';
import { X } from 'lucide-react';
import { ResizableThreadSidebar } from '../../../../shared/chat/ResizableThreadSidebar';
import type { DrawerMotionView } from './useDrawerMotion';
import './chat-sidebar.less';

export function ChatSidebar({ desktop, open, onClose, children, customHeading = false, headingExtra, motion }: {
  desktop: boolean; open: boolean; onClose: () => void; children: ReactNode;
  customHeading?: boolean;
  headingExtra?: ReactNode;
  motion?: DrawerMotionView;
}) {
  useLanguage();
  useEffect(() => {
    if (desktop || !open) return;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    // A mobile drawer covers the conversation; its hidden text must not retain floating selection controls.
    if (element?.closest('.chat-message-region')) selection?.removeAllRanges();
  }, [desktop, open]);
  if (desktop && !open) return null;
  // The desktop remote workspace supplies its own resizable sidebar.
  if (desktop && customHeading) return <aside className="chat-sidebar" aria-label={t("client.chat.chatList")}>
    {children}
  </aside>;
  if (desktop) return <ResizableThreadSidebar className="chat-sidebar chat-sidebar-resizable"
    layoutSelector=".chat-diff-layout, .chat-page" label={t("client.chat.chatList")} resizeLabel={t("client.chat.resizeChatList")}>
    <header className="chat-sidebar-heading"><strong>{t("client.app.chat")}</strong>{headingExtra}</header>
    {children}
  </ResizableThreadSidebar>;
  return <Drawer open={motion?.visible ?? open} placement="left" width="min(360px, 88vw)"
    rootClassName={`chat-drawer ${motion?.rootClassName ?? ''}`} rootStyle={motion?.rootStyle}
    title={<div className="chat-drawer-heading"><strong>{t("client.app.chat")}</strong>{headingExtra}</div>}
    destroyOnClose onClose={onClose} closeIcon={<X size={20} aria-label={t("client.chat.collapseChatList")} />}>
    {children}
  </Drawer>;
}
