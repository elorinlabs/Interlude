// Canonical service text. Translate at the display boundary; preserve protocol comparisons.
export default {
  INVALID_RECORD: '下载数据无效，请重新连接后重试。',
  INVALID_MANIFEST: '无法确认文件内容，请重新下载。',
  SOURCE_CHANGED: '源文件已更新，请重新下载。',
  INTEGRITY_FAILED: '文件校验失败，请重试。',
  REPLAY: '下载连接验证失败，请重新连接。',
  EPOCH_EXPIRED: '下载连接已切换，请继续下载。',
  CREDIT_EXCEEDED: '下载连接验证失败，请重新连接。',
  RESOURCE_LIMIT: '下载任务较多，请稍后重试。',
  STORAGE_FAILED: '无法保存文件，请检查可用空间和保存权限。',
  PATH_UNAVAILABLE: '下载连接已中断，请重新连接后继续。',
  CANCELLED: '下载已暂停。',
  FILE_UNAVAILABLE: '文件暂时无法读取，请确认文件存在且有读取权限。',
  PREVIEW_UNAVAILABLE: '文件暂时无法预览，请确认文件可访问且格式和大小受支持。',
  FILE_TOO_LARGE: '文件超过当前传输大小上限。',
};
