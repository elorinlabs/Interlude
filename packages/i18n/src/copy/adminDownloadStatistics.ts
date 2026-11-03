export const downloadLabels: Record<string, [string, string]> = {
  peer: ['设备共享', 'Device sharing'], server: ['服务器', 'Server'], origin: ['官方下载', 'Official download'],
  download: ['整包下载', 'Package download'], lookup: ['查找共享设备', 'Peer lookup'],
  connect: ['建立连接', 'Connection'], transfer: ['传输', 'Transfer'], verify: ['完整性校验', 'Verification'],
  storage: ['文件保存', 'File storage'], policy: ['下载限制', 'Download policy'],
  unavailable: ['暂不可用或连接中断', 'Unavailable or interrupted'], invalid: ['数据校验失败', 'Invalid data'],
  io: ['文件读写失败', 'File access failed'], network: ['网络连接失败', 'Network failure'],
  timeout: ['连接超时', 'Timed out'],
};

export const downloadExplanation = {
  zh: '按北京时间统计。完整下载并通过校验后计入成功次数，服务器下载用户每天按账号去重。'
    + '混合下载分别计入参与来源；流量为本次下载的有效数据，包含未完成下载，不含本地缓存和重复分块。',
  en: 'Dates use Beijing time. Success requires a complete, verified download. Server users are counted once per '
    + 'account per day. Mixed downloads count for each contributing source. Traffic includes accepted data from '
    + 'unfinished downloads, excluding local cache and duplicate blocks.',
};
