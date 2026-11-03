import { useEffect, useMemo, useState } from 'react';
import { directoryProject } from '../projectDirectories';
import { canSelectProject } from '../projects';
import type { ChatController } from './controller';
import type { ChatProject, ChatState } from './types';

export interface ProjectSwitchProps {
  state: ChatState;
  controller: ChatController;
  active: boolean;
}

/** Share project choices and selection guards across the mobile and web composers. */
export function useProjectSwitch({ state, controller, active }: ProjectSwitchProps) {
  const [screen, setScreen] = useState<'projects' | 'create' | null>(null);
  const [saved, setSaved] = useState<ChatProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const cwd = state.selected?.cwd ?? state.draftProject?.cwd ?? '';
  const disabled = !active || !canSelectProject(state);
  useEffect(() => { if (disabled) setScreen(null); }, [disabled]);
  useEffect(() => {
    if (screen !== 'projects' || disabled) return;
    let cancelled = false;
    setLoading(true); setError('');
    void controller.guiTools.projects.list()
      .then(projects => { if (!cancelled) setSaved(projects); })
      .catch(() => { if (!cancelled) setError('项目列表未能加载，请重新打开重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [controller, screen, disabled, revision]);
  const projects = useMemo(() => {
    const known = [...saved, ...state.threads.filter(thread => thread.cwd).map(thread => directoryProject(thread.cwd))];
    if (cwd) known.push(state.draftProject ?? directoryProject(cwd));
    const unique = new Map<string, ChatProject>();
    for (const project of known) {
      if (project.cwd && !unique.has(project.cwd)) unique.set(project.cwd, project);
    }
    return [...unique.values()];
  }, [saved, state.threads, state.draftProject, cwd]);
  const choose = (project: ChatProject) => {
    if (disabled) return;
    setScreen(null);
    void controller.selectProject(project);
  };
  return { cwd, disabled, screen, projects, loading, error, choose,
    label: projects.find(project => project.cwd === cwd)?.label ?? '',
    open: () => { if (!disabled) setScreen('projects'); },
    create: () => { if (!disabled) setScreen('create'); },
    close: () => setScreen(null), retry: () => setRevision(value => value + 1) };
}
