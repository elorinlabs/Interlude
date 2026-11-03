import { t, useLanguage } from '../i18n';
import { Drawer, Grid, Modal } from "antd";
import { Popup, SafeArea } from "antd-mobile";
import { useContext, useId, type ReactNode } from "react";
import { WorkspaceDrawerContext } from "../../../../shared/chat/workspaceDrawer";
import { WorkspaceDrawerTab } from "../../../../shared/chat/WorkspaceDrawerTab";
import { useSheetDrag } from './useSheetDrag';

interface AdaptiveSheetProps {
  open: boolean;
  title: string;
  titleIcon?: ReactNode;
  titleAction?: ReactNode;
  truncateTitle?: boolean;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  width?: number;
  className?: string;
  presentation?: "adaptive" | "drawer";
  afterOpenChange?: (open: boolean) => void;
  tabId?: string;
  hideMobileHeader?: boolean;
  mobileFullscreen?: boolean;
}

export function AdaptiveSheet({
  open,
  title,
  titleIcon,
  titleAction,
  truncateTitle = false,
  subtitle,
  onClose,
  onBack,
  children,
  width = 520,
  className,
  presentation = "adaptive",
  afterOpenChange,
  tabId,
  hideMobileHeader = false,
  mobileFullscreen = false,
}: AdaptiveSheetProps) {
  useLanguage();
  const workspace = useContext(WorkspaceDrawerContext);
  const generatedId = useId();
  const screens = Grid.useBreakpoint();
  const drag = useSheetDrag(onClose, !mobileFullscreen);
  const back = onBack && <button type="button" className="sheet-close" onClick={onBack}
    aria-label={t("client.app.goBackOneLevel")}>‹</button>;
  const titleClassName = truncateTitle ? 'sheet-title-truncated' : undefined;
  const desktopTitle = <strong className={titleClassName}>{title}</strong>;
  const mobileTitle = <h2 className={titleClassName}>{title}</h2>;
  const heading = <div className="modal-heading" style={{ minWidth: 0, flex: 1 }}>
    {titleAction ? <div className="sheet-title-row">{desktopTitle}{titleAction}</div> : desktopTitle}
    {subtitle ? <span>{subtitle}</span> : null}</div>;
  const titleContent = onBack || titleIcon
    ? <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>{back}{titleIcon}{heading}</div> : heading;
  if (presentation === "drawer") {
    if (workspace) return <WorkspaceDrawerTab active={open} autoOpen
      tab={{ id: tabId ?? generatedId, title, icon: titleIcon }} onVisibilityChange={afterOpenChange}
      className={`workspace-drawer-tab-scroll ${className ?? ''}`}>
      {() => <>{(onBack || subtitle || titleAction) && titleContent}{children}</>}
    </WorkspaceDrawerTab>;
    return <Drawer open={open} title={titleContent} placement="right" width={`min(${width}px, 100vw)`}
      afterOpenChange={afterOpenChange}
      className={className}
      onClose={onClose} destroyOnHidden closable={{ 'aria-label': t("client.projectBrowser.close"), placement: 'end' }}>
      {children}
    </Drawer>;
  }
  if (screens.md) {
    return <Modal open={open} onCancel={onClose} footer={null} width={width} centered destroyOnClose className={className}
      closable={{ 'aria-label': t("client.projectBrowser.close") }}
      styles={{ header: truncateTitle || titleAction ? { paddingRight: 32 } : undefined }}
      title={titleContent}>
      {children}
    </Modal>;
  }
  return <Popup visible={open} onMaskClick={onClose} destroyOnClose bodyStyle={drag.style}
    bodyClassName={['mobile-popup', mobileFullscreen && 'mobile-popup-fullscreen', className].filter(Boolean).join(' ')}>
    <div ref={drag.ref} className="sheet-drag-surface">
    {!mobileFullscreen && <div className="sheet-drag-handle" role="button" tabIndex={0}
      aria-label={t('client.sheet.dragToClose')} onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onClose();
      }}><div className="sheet-handle" /></div>}
    {!hideMobileHeader && <div className="sheet-header">{back}{titleIcon}<div style={{ flex: 1, minWidth: 0 }}>
      {titleAction ? <div className="sheet-title-row">{mobileTitle}{titleAction}</div> : mobileTitle}
      {subtitle ? <p>{subtitle}</p> : null}</div>
      <button type="button" className="sheet-close" onClick={onClose}
        aria-label={t("client.projectBrowser.close")}>×</button></div>}
    <div className="adaptive-sheet-content">{children}</div>
    <SafeArea position="bottom" />
    </div>
  </Popup>;
}
