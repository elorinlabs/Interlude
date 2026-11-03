import { createContext, useContext } from 'react';
import { defaultText } from '../localization/messages';

export type DiffTranslate = (source: string, values?: Record<string, string | number>) => string;

/** Diff labels follow the host's language without translating paths or code. */
export const DiffTextContext = createContext<DiffTranslate>(defaultText);
export const useDiffText = () => useContext(DiffTextContext);
