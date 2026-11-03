const copy = {
  zh: {
    label: "会话用量统计", cache: value => `缓存命中 ${value}`,
    speedHint: "当前会话已完成请求的平均输出速度，使用 Interlude 的请求计时。",
    cacheHint: "当前会话累计缓存输入 Token 占累计输入 Token 的比例。",
    contextHint: "当前会话的上下文占用，与账号剩余额度无关。",
    waiting: "等待当前会话的用量数据。",
  },
  en: {
    label: "Conversation usage", cache: value => `Cache hit ${value}`,
    speedHint: "Average output speed of completed requests in this conversation, using Interlude request timings.",
    cacheHint: "Cumulative cached input tokens as a share of cumulative input tokens in this conversation.",
    contextHint: "Context used by this conversation, separate from account quota.",
    waiting: "Waiting for this conversation's usage data.",
  },
  ru: {
    label: "Расход в диалоге", cache: value => `Попадания в кеш ${value}`,
    speedHint: "Средняя скорость вывода завершённых запросов диалога по замерам Interlude.",
    cacheHint: "Доля кешированных входных токенов среди всех входных токенов диалога.",
    contextHint: "Расход контекста этого диалога, отдельно от лимита аккаунта.",
    waiting: "Ожидание данных о расходе в этом диалоге.",
  },
  ja: {
    label: "会話の使用状況", cache: value => `キャッシュ命中率 ${value}`,
    speedHint: "この会話で完了したリクエストの平均出力速度。",
    cacheHint: "この会話の累計入力トークンに占めるキャッシュ済みトークンの割合。",
    contextHint: "この会話のコンテキスト使用率。アカウントの残り利用枠とは異なります。",
    waiting: "この会話の使用状況を取得しています。",
  },
};
