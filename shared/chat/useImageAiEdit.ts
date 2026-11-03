import { useContext, useEffect, useRef, useState } from 'react';
import { ImageAiContext } from './ImageAiContext';
import { imageAiPrompt, type ImageAiTool } from './imageAiEdit';

export function useImageAiEdit(options: { load: () => Promise<string>; close: () => void }) {
  const context = useContext(ImageAiContext);
  const [tool, setTool] = useState<ImageAiTool | null>(null);
  const [detail, setDetail] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const submit = async () => {
    if (!tool || !context?.enabled || pending.current) return;
    let prompt: string;
    try { prompt = imageAiPrompt({ tool, detail, width, height }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '请检查编辑要求。'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const source = await options.load();
      if (!mounted.current) return;
      if (!await context.send(prompt, source)) throw new Error('Send rejected');
      options.close();
    } catch { setError('未能提交图片，请检查连接后重试。'); }
    finally { pending.current = false; setBusy(false); }
  };
  const select = (value: ImageAiTool | null) => {
    if (pending.current) return;
    setTool(value); setDetail(''); setError('');
  };
  return { available: !!context, enabled: !!context?.enabled, tool, select, detail, setDetail,
    width, setWidth, height, setHeight, busy, error, submit };
}
