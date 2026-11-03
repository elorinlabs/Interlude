import { createContext, type ReactNode } from 'react';
import type { TerminalInfo } from './types';
import { TerminalLaunchContext } from './TerminalLaunchContext';

interface ScriptTab { id: string; cwd: string; npmScript?: string; exited?: boolean; session?: TerminalInfo }
export interface ScriptPanel {
  tabs: ScriptTab[]; busy?: boolean;
  addInDirectory: (cwd: string, npmScript?: string) => void;
  remove: (id: string) => void;
}

export const NpmScriptContext = createContext<ScriptPanel | undefined>(undefined);

/** Editors and terminal tabs share the workspace's process state across clients. */
export function TerminalWorkspaceProvider({ panel, children }: { panel?: ScriptPanel; children: ReactNode }) {
  return <TerminalLaunchContext.Provider value={panel?.addInDirectory}>
    <NpmScriptContext.Provider value={panel}>{children}</NpmScriptContext.Provider>
  </TerminalLaunchContext.Provider>;
}
