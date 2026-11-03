import { getInterfaceLanguage, setInterfaceLanguage } from "../../../../shared/localization/interfaceLanguage";
import { localeForLanguage, type Language } from "../../../../shared/localization/language";
import { translateMessage, type MessageKey, type TranslationValues } from "../../../../shared/localization/messages";

export const setGuiLanguage = setInterfaceLanguage;
export const guiLanguage = getInterfaceLanguage;
export const guiLocale = () => localeForLanguage(guiLanguage());
export { displayText } from '../../../../shared/localization/messages';
export { remoteErrorText as displayError } from '../../../../shared/localization/errors';

/** Only call for application copy; never translate conversation content or user data. */
export function uiText(key: MessageKey, values: TranslationValues = {}, language: Language = guiLanguage()): string {
  return translateMessage(language, key, values);
}
