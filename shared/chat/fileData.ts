/** FileReader keeps file encoding asynchronous, including large clipboard text attachments. */
export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reader.onabort = () => reject(new Error('文件无法读取，请重新选择。'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}
