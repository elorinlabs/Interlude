import { createContext } from 'react';

/** Submit into the owning conversation without changing its composer draft. */
export const ImageAiContext = createContext<null | {
  enabled: boolean;
  send: (text: string, image: string) => Promise<boolean>;
}>(null);
