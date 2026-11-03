import { createErrorFormatter } from '@interlude/i18n/errors';
import { resources } from '@interlude/i18n/client';
import { getInterfaceLanguage } from './interfaceLanguage';
import type { Language } from './language';
import templateKeys from '@interlude/i18n/error-templates';

export const formatRemoteError = createErrorFormatter(resources, templateKeys);

/** Format remote responses only at their display boundary. Never rewrite stored errors or classifiers. */
export function remoteErrorText(error: unknown, language: Language = getInterfaceLanguage()): string {
  return formatRemoteError(language, error);
}
