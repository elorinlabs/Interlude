import { getLanguage } from './language';
import { applications, languageOptions } from '@interlude/i18n';
import { translateMessage, type MessageKey, type TranslationValues } from "../../../../shared/localization/messages";

export { getLanguage, getLocale, setLanguage, useLanguage } from './language';
export const LANGUAGE_OPTIONS = languageOptions(applications.web);
export { languageLabel } from '@interlude/i18n';
export type { Language } from './language';
import { displayText as renderText } from '../../../../shared/localization/messages';
import { formatRemoteError } from '../../../../shared/localization/errors';
export const displayText = (value: string, values?: TranslationValues) => renderText(value, values, getLanguage());
export const displayError = (error: unknown) => formatRemoteError(getLanguage(), error);
export const t = (key: MessageKey, values?: TranslationValues): string => translateMessage(getLanguage(), key, values);
