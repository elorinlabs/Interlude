import { useEffect, useRef, useState } from "react";
import { parseContextCapacity, TOKENS_PER_K, type ContextSettingsApi } from "../contextSettings";

export function useContextSettings(threadId: string, api: ContextSettingsApi) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoaded(false); setError("");
    void api.read(threadId).then((settings) => {
      if (cancelled) return;
      setValue(settings.capacity === null ? "" : String(settings.capacity / TOKENS_PER_K));
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setError("暂时无法读取上下文设置，请重试。");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [threadId, api, attempt]);

  const save = async () => {
    if (!loaded || loading || pending.current) return false;
    const capacity = parseContextCapacity(value);
    if (capacity === undefined) { setError("请输入 1 至 100000 K 之间的上下文容量。"); return false; }
    pending.current = true; setSaving(true); setError("");
    try {
      const result = await api.write(threadId, { capacity });
      if (result.update === 'resumeFailed' || result.update === 'paused') {
        if (mounted.current) setError(result.update === 'paused'
          ? '容量已更新，对话保持暂停。关闭设置后可点击继续。'
          : '容量已更新，但未能继续回复。关闭设置后可点击继续。');
        return false;
      }
      return mounted.current;
    } catch {
      if (mounted.current) setError("未能保存或应用上下文设置，请重试；若对话已暂停，可点击继续。");
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  return { value, setValue, loading, loaded, saving, error, save, retry: () => setAttempt((value) => value + 1) };
}
