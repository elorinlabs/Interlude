import { useRef, useState } from 'react';
import type { ChatController } from './controller';
import type { ChatProject, ChatState } from './types';
import { projectActionReason, type ProjectAction } from './projectActions';

/** Shared mobile project menu state; mutations remain serialized by the controller. */
export function useProjectActions(state: ChatState, controller: {
  projectActions: Pick<ChatController['projectActions'], 'run'>;
}) {
  const [target, setTarget] = useState<ChatProject | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const open = (project: ChatProject) => {
    if (inFlight.current || !project.cwd) return;
    setTarget({ cwd: project.cwd, label: project.label }); setConfirmRemove(false); setError('');
  };
  const close = () => { if (!inFlight.current) setTarget(null); };
  const confirm = (value: boolean) => {
    if (inFlight.current) return;
    setConfirmRemove(value); setError('');
  };
  const submit = async (action: ProjectAction) => {
    if (!target || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await controller.projectActions.run(target.cwd, action); setTarget(null); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'client.errors.theOperationFailedPleaseTryAgain');
    } finally { inFlight.current = false; setBusy(false); }
  };
  const pinned = Boolean(target && state.sidebar.pinnedProjects?.includes(target.cwd));
  return { target, pinned, confirmRemove, error, busy, reason: projectActionReason(state),
    open, close, confirm, submit };
}

export type ProjectActionsModel = ReturnType<typeof useProjectActions>;
