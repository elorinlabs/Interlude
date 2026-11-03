import { useId, useRef, type ReactNode } from 'react';
import { useThreadSidebarResize } from './useThreadSidebarResize';
import styles from './ResizableThreadSidebar.module.less';

interface Props {
  children: ReactNode;
  className: string;
  layoutSelector: string;
  resizeLabel: string;
  label?: string;
}

export function ResizableThreadSidebar({ children, className, layoutSelector, resizeLabel, label }: Props) {
  const sidebar = useRef<HTMLElement>(null);
  const id = useId();
  const resize = useThreadSidebarResize(sidebar, layoutSelector);
  return <aside ref={sidebar} id={id} className={`${styles.sidebar} ${className}`} aria-label={label}
    style={{ width: resize.enabled ? resize.width : undefined }} data-resizing={resize.dragging || undefined}>
    {children}
    {resize.enabled && <div className={styles.handle} role="separator" tabIndex={0}
      aria-label={resizeLabel} aria-orientation="vertical" aria-controls={id}
      aria-valuemin={resize.minimum} aria-valuemax={resize.maximum} aria-valuenow={resize.width} {...resize.handle} />}
  </aside>;
}
