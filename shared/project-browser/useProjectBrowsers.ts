import { useState } from 'react';

/** Closing the drawer hides it; only an explicit tab close discards a document. */
export function useProjectBrowsers() {
  const [projects, setProjects] = useState<string[]>([]);
  const [visible, setVisible] = useState<string>();
  const open = (cwd: string) => {
    setProjects(current => current.includes(cwd) ? current : [...current, cwd]);
    setVisible(cwd);
  };
  return { projects, visible, open, close: () => setVisible(undefined) };
}
