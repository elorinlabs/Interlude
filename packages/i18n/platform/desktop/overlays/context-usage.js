const copy = {
  zh: {
    title: "背景信息窗口", view: "查看上下文用量", empty: "暂无上下文用量", unknown: "上下文容量未知",
    percent: (used, left) => `${used}% 已用（剩余 ${left}%）`,
    tokens: (used, total) => `已用 ${used} Token${total === null ? "" : `，共 ${total}`}`,
  },
  en: {
    title: "Context window", view: "View context usage",
    empty: "No context usage yet", unknown: "Context capacity unknown",
    percent: (used, left) => `${used}% used (${left}% left)`,
    tokens: (used, total) => `${used} tokens used${total === null ? "" : `, ${total} total`}`,
  },
  ru: {
    title: "Контекстное окно", view: "Посмотреть расход контекста",
    empty: "Нет данных о контексте", unknown: "Размер контекста неизвестен",
    percent: (used, left) => `Использовано ${used}% (осталось ${left}%)`,
    tokens: (used, total) => `Использовано ${used} токенов${total === null ? "" : `, всего ${total}`}`,
  },
};
