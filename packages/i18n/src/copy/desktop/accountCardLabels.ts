import type { AppLanguage } from '../../registry';
type Language = AppLanguage<'desktop'>;

const labels = {
  ja: {
    today: '今日の使用量', noData: 'データがありません', details: '使用量の詳細を表示', used: '使用済み', disabled: '無効',
    remaining: '残量', countdown: '残り {time}', hint: '割合は現在の残量です。表示された時刻にリセットされます。',
  },
  zh: {
    today: "今日消耗", noData: "暂无数据", details: "查看用量详情", used: "已使用", disabled: "已禁用",
    remaining: "剩余额度", countdown: "剩余 {time}",
    hint: "百分比表示当前剩余额度，用量会在重置时间恢复。",
  },
  en: {
    today: "Today", noData: "No data yet", details: "View usage details", used: "Used", disabled: "Disabled",
    remaining: "Remaining quota", countdown: "{time} left",
    hint: "The percentage shows your remaining quota. Usage resets at the time shown.",
  },
  ru: {
    today: "Сегодня", noData: "Пока нет данных", details: "Подробнее о расходе", used: "Использовано",
    disabled: "Отключён",
    remaining: "Остаток лимита", countdown: "Осталось {time}",
    hint: "Процент показывает остаток лимита. Лимит восстанавливается в указанное время.",
  },
};

export function accountCardLabels(language: Language) {
  return labels[language];
}
