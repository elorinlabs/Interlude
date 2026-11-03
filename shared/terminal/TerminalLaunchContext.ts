import { createContext } from 'react';

/** Launch a new shell in the current workspace without replacing its existing tabs. */
export const TerminalLaunchContext = createContext<((cwd: string) => void) | undefined>(undefined);
