import type { AppLanguage } from '../../registry';
type Language = AppLanguage<'desktop'>;

const labels = {
  ja: {
    title: 'アカウントの並べ替え', hint: '左側のハンドルをドラッグして並べ替え、保存してください。',
    drag: 'ドラッグまたは上下キーで並べ替え', save: '順序を保存', cancel: 'キャンセル',
    error: '順序を保存できませんでした。もう一度お試しください。', up: '上へ移動', down: '下へ移動',
  },
  zh: {
    title: "账号排序", hint: "拖动左侧手柄调整顺序，保存后生效。",
    drag: "拖动排序，也可使用上下方向键", save: "保存顺序", cancel: "取消",
    error: "未能保存排序，请重试。", up: "上移", down: "下移",
  },
  en: {
    title: "Reorder accounts", hint: "Drag the handles to reorder accounts, then save your changes.",
    drag: "Drag to reorder, or use the up and down arrow keys", save: "Save order", cancel: "Cancel",
    error: "Couldn't save the order. Please try again.", up: "Move up", down: "Move down",
  },
  ru: {
    title: "Порядок аккаунтов", hint: "Перетащите аккаунты за маркеры слева и сохраните порядок.",
    drag: "Изменить порядок перетаскиванием или клавишами со стрелками", save: "Сохранить порядок", cancel: "Отмена",
    error: "Не удалось сохранить порядок. Повторите попытку.", up: "Переместить вверх", down: "Переместить вниз",
  },
};

export function accountOrderLabels(language: Language) {
  return labels[language];
}
