import copiesResource from '@interlude/i18n/copy/desktop/help';
import type { Language } from '../../i18n';
import type { HelpError } from './types';
import type { HelpSetupError, HelpSetupPhase } from './useHelpSetup';
import type { HelpImageError } from './useHelpImages';

interface HelpCopy {
  title: string; subtitle: string; close: string; clear: string; placeholder: string;
  hide: string; visibilityLabel: string; visibilityDescription: string; visibilitySaveError: string;
  send: string; thinking: string; checking: string; retry: string; unread: string;
  stop: string; operating: string;
  addImage: string; removeImage: string; image: string; readingImages: string;
  imageErrors: Record<HelpImageError, string>;
  install: string; initialize: string; selectAccount: string;
  setupPhases: Record<HelpSetupPhase, string>; setupErrors: Record<HelpSetupError, string>;
  welcome: string; description: string; sources: string; questions: string[];
  errors: Record<HelpError, string>;
}

const copies: Record<Language, HelpCopy> = copiesResource;

export function helpCopy(language: Language) { return copies[language]; }
export type { HelpCopy };
