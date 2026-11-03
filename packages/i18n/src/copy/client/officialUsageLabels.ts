const zh = {
  title: '官方账户跨设备用量', account: '官方账户', devices: '设备', tokens: 'Token 消耗',
  cost: '消耗金额（{unit}）', remaining: '预估可用额度（{unit}）', capacity: '100% 额度预估（{unit}）',
  primary: '主要额度', secondary: '次要额度', unavailable: '暂无足够数据',
  hint: '根据起始额度至今的降幅和各设备累计消耗估算；额度回升后重新累计，仅供参考。',
  detail: '剩余预估额度 / 总预估额度。有两种额度限制时，显示剩余较少的一组。根据近期用量估算，仅供参考。',
  signedOut: '登录后可查看跨设备用量与额度预估。', ready: '汇总各设备记录的官方账户用量。',
  unavailableStatus: '暂时无法读取账户用量，请稍后重试。',
  updated: '更新于', empty: '暂无官方账户用量',
};
type Labels = { [Key in keyof typeof zh]: string };
const en: Labels = {
  title: 'Official account usage across devices', account: 'Official account', devices: 'Devices', tokens: 'Tokens used',
  cost: 'Usage cost ({unit})', remaining: 'Estimated available ({unit})', capacity: 'Estimated 100% quota ({unit})',
  primary: 'Primary quota', secondary: 'Secondary quota', unavailable: 'Not enough data',
  hint: 'Estimated from the quota drop and accumulated usage across devices since the baseline. '
    + 'Restarts when quota rises. For reference only.',
  detail: 'Estimated remaining / total quota. When two limits apply, shows the quota with less remaining. '
    + 'Based on recent usage, for reference only.',
  signedOut: 'Sign in to view usage across devices and quota estimates.',
  ready: 'Includes official account usage recorded by each device.',
  unavailableStatus: 'Account usage is temporarily unavailable. Please try again later.',
  updated: 'Updated', empty: 'No official account usage',
};
const ru: Labels = {
  title: 'Расход официальных аккаунтов на устройствах', account: 'Официальный аккаунт', devices: 'Устройства',
  tokens: 'Расход токенов', cost: 'Стоимость ({unit})', remaining: 'Ориентировочно доступно ({unit})',
  capacity: 'Ориентировочный полный лимит ({unit})', primary: 'Основной лимит', secondary: 'Второй лимит',
  unavailable: 'Недостаточно данных',
  hint: 'Оценка по снижению лимита с начальной точки и суммарному расходу на устройствах. '
    + 'Когда лимит восстанавливается, расчёт начинается заново. Только для справки.',
  detail: 'Ориентировочный остаток / полный лимит. Если действуют два лимита, показан тот, где остаток меньше. '
    + 'Оценка по недавнему расходу, только для справки.',
  signedOut: 'Войдите, чтобы увидеть расход на устройствах и оценку лимита.',
  ready: 'Расход официальных аккаунтов, записанный на устройствах.',
  unavailableStatus: 'Данные о расходе временно недоступны. Повторите попытку позже.',
  updated: 'Обновлено', empty: 'Нет данных о расходе',
};
const ja: Labels = {
  title: 'デバイス間の公式アカウント使用量', account: '公式アカウント', devices: 'デバイス', tokens: '使用トークン数',
  cost: '使用料金（{unit}）', remaining: '推定残量（{unit}）', capacity: '上限 100% の推定量（{unit}）',
  primary: 'メインの上限', secondary: 'サブの上限', unavailable: 'データが不足しています',
  hint: '基準時点からの残量の減少と各デバイスの累積使用量に基づく推定です。残量が回復すると再計算します。参考値としてご利用ください。',
  detail: '推定残量／推定総量。上限が 2 種類ある場合は残量が少ない方を表示します。直近の使用量に基づく参考値です。',
  signedOut: 'ログインすると、デバイス間の使用量と推定残量を確認できます。',
  ready: '各デバイスに記録された公式アカウントの使用量を集計します。',
  unavailableStatus: 'アカウントの使用量を取得できません。しばらくしてから再試行してください。',
  updated: '更新日時', empty: '公式アカウントの使用量がありません',
};
const localized: Readonly<Record<string, Labels>> = { zh, en, ru, ja };
export function officialUsageLabels(language: string, unit = 'USD'): Labels {
  const labels = Object.hasOwn(localized, language) ? localized[language] : en;
  return { ...labels, cost: labels.cost.replace('{unit}', () => unit),
    remaining: labels.remaining.replace('{unit}', () => unit), capacity: labels.capacity.replace('{unit}', () => unit) };
}
