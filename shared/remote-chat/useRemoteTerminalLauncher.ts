import { useEffect, useMemo, useState } from 'react';
import { useRemoteTerminalPanel } from './useRemoteTerminalPanel';
import { terminalProjectKey } from './terminalProject';

/** Keep loading and error details inside the drawer, even before a shell is available. */
export function useRemoteTerminalLauncher(options: Parameters<typeof useRemoteTerminalPanel>[0]) {
  const panel = useRemoteTerminalPanel(options);
  const project = terminalProjectKey(options.cwd);
  const scope = useMemo(() => ({}), [options.client, project]);
  const [view, setView] = useState<{ scope: object; requested: boolean; directory?: string; npmScript?: string } | null>(null);
  const open = view?.scope === scope && (view.requested || panel.open);
  useEffect(() => {
    if (panel.open) setView(previous => previous?.scope === scope ? { ...previous, requested: false } : previous);
  }, [panel.open, scope]);
  const hide = () => { setView(null); panel.hide(); };
  const addInDirectory = (directory: string, npmScript?: string) => {
    setView({ scope, requested: !panel.open, directory, npmScript });
    panel.addInDirectory(directory, npmScript);
  };
  const toggle = () => {
    if (open) { hide(); return; }
    setView({ scope, requested: !panel.open });
    // Existing errors remain readable while offline; only an explicit retry starts another request.
    if (!panel.open && (!panel.error || panel.tabs.length)) panel.toggle();
  };
  const retry = () => {
    if (view?.scope === scope && view.directory !== undefined) panel.addInDirectory(view.directory, view.npmScript);
    else panel.toggle();
  };
  return { ...panel, open, toggle, hide, addInDirectory, retry };
}
