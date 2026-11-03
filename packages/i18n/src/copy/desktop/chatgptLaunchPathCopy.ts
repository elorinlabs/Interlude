import type { AppLanguage } from '../../registry';
type Language = AppLanguage<'desktop'>;

const copy = {
  ja: {
    title: 'ChatGPT の起動パス', description: '起動や再起動にこのパスを使います。空欄の場合は自動検出します。',
    label: 'アプリのパス', placeholder: 'ChatGPT が見つかりません。アプリのフルパスを入力してください',
    loading: 'ChatGPT のパスを検出中…', save: '保存', saved: '保存しました。次回の起動または再起動時に適用されます。',
    load: '起動パスを読み取れません。設定ページを開き直してください。',
    invalid: '有効な ChatGPT アプリまたは実行ファイルのフルパスを入力してください。',
    error: '起動パスを保存できませんでした。もう一度お試しください。',
  },
  zh: {
    title: 'ChatGPT 启动路径',
    description: '启动和重启时优先使用此路径。留空则自动识别。',
    label: '应用路径',
    placeholder: '未找到 ChatGPT，请填写应用的完整路径',
    loading: '正在识别 ChatGPT 路径…',
    save: '保存',
    saved: '已保存，下次启动或重启时生效。',
    load: '暂时无法读取启动路径，请重新打开设置页。',
    invalid: '请选择有效的 ChatGPT 应用或可执行文件，并填写完整路径。',
    error: '暂时无法保存启动路径，请重试。',
  },
  en: {
    title: 'ChatGPT launch path',
    description: 'Use this path when starting or restarting ChatGPT. Leave blank to detect it automatically.',
    label: 'Application path',
    placeholder: 'ChatGPT not found. Enter the full application path',
    loading: 'Detecting the ChatGPT path…',
    save: 'Save',
    saved: 'Saved. Applies the next time ChatGPT starts or restarts.',
    load: 'Could not load the launch path. Reopen Settings and try again.',
    invalid: 'Enter the full path to a valid ChatGPT application or executable.',
    error: 'Could not save the launch path. Please try again.',
  },
  ru: {
    title: 'Путь запуска ChatGPT',
    description: 'Используется при запуске и перезапуске ChatGPT. Оставьте поле пустым, чтобы путь определялся автоматически.',
    label: 'Путь к приложению',
    placeholder: 'ChatGPT не найден. Укажите полный путь к приложению',
    loading: 'Определение пути к ChatGPT…',
    save: 'Сохранить',
    saved: 'Сохранено. Применится при следующем запуске или перезапуске ChatGPT.',
    load: 'Не удалось загрузить путь запуска. Откройте настройки заново.',
    invalid: 'Укажите полный путь к приложению или исполняемому файлу ChatGPT.',
    error: 'Не удалось сохранить путь запуска. Повторите попытку.',
  },
} as const;

export const chatGptLaunchPathCopy = (language: Language) => copy[language];
