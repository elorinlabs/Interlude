const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Native clipboard/save receives bytes, never a remote filesystem path or an unresolved remote URL. */
export async function remoteImageBytes(url: string): Promise<string> {
  if (/^data:image\/[\w.+-]+;base64,/i.test(url)) return url;
  if (!url.startsWith('blob:')) throw new Error('图片暂时无法读取，请重新打开。');
  const blob = await (await fetch(url)).blob();
  if (!blob.type.startsWith('image/') || blob.size > MAX_IMAGE_BYTES) throw new Error('图片暂时无法读取，请重新打开。');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败。'));
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(blob);
  });
}
