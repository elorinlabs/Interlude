import { useRef, useState } from "react";
import type { TerminalInfo } from '../../../../../../shared/terminal/types';

export const MAX_TERMINAL_TABS = 8;
export interface TerminalTab { id: string; cwd: string; session?: TerminalInfo; npmScript?: string; exited?: boolean }

export function useTerminalPanel(cwd: string) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [selected, setSelected] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const currentTabs = useRef(tabs);
  currentTabs.current = tabs;
  const adopt = (session: TerminalInfo) => {
    setTabs(current => [...current, { id: session.id, cwd: session.cwd, session }]);
    setSelected(session.id); setOpen(true); setError('');
  };
  const addInDirectory = (directory: string, npmScript?: string) => {
    setOpen(true);
    const existing = currentTabs.current.find(tab => npmScript && tab.cwd === directory
      && tab.npmScript === npmScript && !tab.exited);
    if (existing) { setSelected(existing.id); return; }
    if (currentTabs.current.length >= MAX_TERMINAL_TABS) {
      setError('client.terminal.closeATerminalBeforeOpeningAnotherOne'); return;
    }
    setError('');
    const tab = { id: crypto.randomUUID(), cwd: directory, npmScript };
    currentTabs.current = [...currentTabs.current, tab];
    setTabs((current) => [...current, tab]); setSelected(tab.id);
  };
  const add = () => addInDirectory(cwd);
  const remove = (id: string) => {
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    setError('');
    if (selected === id) setSelected(remaining.at(-1)?.id ?? "");
    if (!remaining.length) setOpen(false);
  };
  const exited = (id: string) => setTabs(current => current.map(tab => tab.id === id ? { ...tab, exited: true } : tab));
  return { tabs, selected, open, error, add, adopt, projectCwd: cwd, addInDirectory,
    remove, exited, select: setSelected, hide: () => setOpen(false),
    toggle: () => { if (!tabs.length) add(); else setOpen(!open); } };
}

export type TerminalPanelState = Omit<ReturnType<typeof useTerminalPanel>, 'adopt' | 'projectCwd' | 'exited'> & {
  adopt?: (session: TerminalInfo) => void; projectCwd?: string;
  exited?: (id: string) => void;
};
