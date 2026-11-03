// Canonical service text. Translate at the display boundary; preserve protocol comparisons.
export default {
  idle: '点击“检查更新”查看是否有新版本。',
  checking: '正在检查更新…',
  available: '有新版本可安装。',
  latest: '电脑端已是最新版本。',
  downloading: '电脑正在下载更新…',
  installing: '电脑正在安装更新，连接可能暂时中断。',
  reconnecting: '正在等待电脑重新连接，请稍后查看版本。',
  error: '更新未完成，请重试。',
  offline: '电脑已离线，请打开电脑端后重试。',
  unsupported: '请先在电脑上更新 Interlude，再使用远程更新。',
  disconnected: '连接已断开，请重新连接后查看结果。',
  timeout: '电脑暂未响应，请重试；已发送的安装指令可能仍在执行。',
  failed: '操作未完成，请稍后重试。',
} as const;
