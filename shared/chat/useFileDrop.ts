import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react';

export type FileDropEvent = { type: 'leave' } | {
  type: 'enter' | 'over' | 'drop';
  position: { x: number; y: number };
  paths?: string[];
};
export type SubscribeFileDrop = (listener: (event: FileDropEvent) => void) => Promise<() => void>;

export function fileDropError(error: unknown): string {
  const messages = [
    '请重新将文件拖入输入框。',
    '每条消息最多添加 32 个文件或文件夹。',
    '远程聊天暂不支持拖入文件夹，请选择其中的文件。',
    '附件总大小过大，请减少照片或文件后再试。',
  ];
  return typeof error === 'string' && messages.includes(error) ? error : '文件添加失败，请重新选择。';
}

interface Options {
  target: RefObject<HTMLElement>;
  scope: string | null;
  active: boolean;
  disabled: boolean;
  subscribe?: SubscribeFileDrop;
  addPaths?: (paths: string[], current: () => boolean, target: Element | null) => Promise<void>;
  addFiles: (files: File[], target: Element | null) => void | Promise<void>;
  onTargetChange?: (target: Element | null) => void;
  report: (error: unknown) => void;
}

function nativeDropTarget(target: HTMLElement | null, position: { x: number; y: number }) {
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const x = position.x / scale;
  const y = position.y / scale;
  const inside = rect.width > 0 && rect.height > 0
    && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const hovered = document.elementFromPoint?.(x, y);
  return inside && (!hovered || target.contains(hovered)) ? hovered ?? target : null;
}

/** Only the visible composer accepts files; late reads must not enter another draft. */
export function useFileDrop(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const generation = useRef(0);
  const pending = useRef(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    generation.current++;
    pending.current = false; setReading(false); setDragging(false);
    return () => { generation.current++; };
  }, [options.scope, options.active]);
  useEffect(() => { if (options.disabled) setDragging(false); }, [options.disabled]);

  const accept = (read: (current: () => boolean) => void | Promise<void>) => {
    if (!latest.current.active || latest.current.disabled || pending.current) return;
    const version = generation.current;
    const scope = latest.current.scope;
    const current = () => generation.current === version && latest.current.active && latest.current.scope === scope;
    pending.current = true; setReading(true); setDragging(false);
    void Promise.resolve().then(() => { if (current()) return read(current); }).catch(error => {
      if (current()) latest.current.report(error);
    }).finally(() => {
      if (current()) { pending.current = false; setReading(false); }
    });
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    if (!options.active || !options.subscribe) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void options.subscribe(event => {
      if (disposed) return;
      const value = latest.current;
      const target = event.type === 'leave' ? null : nativeDropTarget(value.target.current, event.position);
      const allowed = Boolean(target) && value.active && !value.disabled && !pending.current;
      if (allowed) value.onTargetChange?.(target);
      setDragging(allowed && event.type !== 'drop');
      const addPaths = value.addPaths;
      if (allowed && event.type === 'drop' && event.paths?.length && addPaths) {
        const paths = event.paths;
        acceptRef.current(current => addPaths(paths, current, target));
      }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(error => {
      if (!disposed) latest.current.report(error);
    });
    return () => { disposed = true; unlisten?.(); };
  }, [options.active, options.subscribe]);

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault(); event.stopPropagation();
    const allowed = options.active && !options.disabled && !pending.current;
    event.dataTransfer.dropEffect = allowed ? 'copy' : 'none';
    if (allowed) options.onTargetChange?.(event.target instanceof Element ? event.target : null);
    setDragging(allowed);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    // Native WebViews deliver paths separately; handling both events would duplicate attachments.
    if (options.subscribe) return;
    const files = Array.from(event.dataTransfer.files);
    const target = event.target instanceof Element ? event.target : null;
    if (files.length) accept(() => options.addFiles(files, target));
  };
  // Native drops can arrive before React commits the loading state; send handlers need the live guard.
  return { reading, dragging, isReading: () => pending.current, clearDrag: () => setDragging(false),
    handlers: { onDragOver, onDragEnter: onDragOver, onDragLeave, onDrop } };
}
