import type { OfflineHistoryStore } from './offline';

export async function offlineImage(options: {
  store?: OfflineHistoryStore; online: boolean; key: string;
  load: () => Promise<string>; failed: () => void;
}): Promise<string> {
  const { store, online, key, load, failed } = options;
  if (!store) return load();
  if (!online) {
    try {
      const cached = await store.readImage(key);
      if (cached) return cached;
    } catch { failed(); }
    throw new Error('这张图片尚未缓存，连接电脑后查看。');
  }
  // Refresh mutable file paths while connected instead of indefinitely serving an old image from disk.
  const url = await load();
  void store.saveImage(key, url).catch(failed);
  return url;
}
