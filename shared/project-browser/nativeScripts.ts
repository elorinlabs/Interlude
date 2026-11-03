import type { ScriptPanel } from '../terminal/TerminalWorkspaceProvider';
import { displayText } from '../localization/messages';
import { withinPath } from './entryActions';

const MAX_PATH_LENGTH = 4096;
const MAX_SCRIPT_LENGTH = 1024;

export interface NativeScriptState {
  busy: boolean;
  tabs: { id: string; cwd: string; npmScript: string; exited: boolean }[];
}

/** Send only script identity and status to the editor, without shell or SSH connection details. */
export function nativeScriptState(panel: ScriptPanel): NativeScriptState {
  return { busy: !!panel.busy, tabs: panel.tabs.flatMap(tab => {
    const npmScript = tab.npmScript ?? tab.session?.npmScript;
    return npmScript ? [{ id: tab.id, cwd: tab.session?.npmScriptCwd ?? tab.cwd, npmScript,
      exited: !!(tab.exited || tab.session?.exited) }] : [];
  }) };
}

export function nativeScriptPanel(state: NativeScriptState | undefined, send: (message: object) => void)
  : ScriptPanel | undefined {
  return state && { ...state,
    addInDirectory: (cwd, name) => send({ type: 'npmScript', action: 'run', cwd, name }),
    remove: id => send({ type: 'npmScript', action: 'stop', id }),
  };
}

const inProject = (path: unknown, cwd: string): path is string => typeof path === 'string'
  && path.length <= MAX_PATH_LENGTH && !path.includes('\0') && withinPath(path, cwd)
  && !path.replace(/\\/g, '/').split('/').includes('..');

/** Only named package scripts in this project, or its existing script terminals, may be controlled. */
export function handleNativeScriptAction(message: unknown, options: {
  panel?: ScriptPanel; cwd: string; connected: boolean;
}): boolean {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'npmScript') return false;
  const { panel, cwd, connected } = options;
  const invalid = () => new Error(displayText('client.npmScripts.invalid'));
  if (!panel || !connected || panel.busy || !('action' in message)) throw invalid();
  if (message.action === 'run' && 'cwd' in message && 'name' in message) {
    if (!inProject(message.cwd, cwd) || typeof message.name !== 'string' || !message.name
      || message.name.length > MAX_SCRIPT_LENGTH || /[\x00-\x1f\x7f-\x9f]/.test(message.name)) {
      throw invalid();
    }
    panel.addInDirectory(message.cwd, message.name);
    return true;
  }
  if (message.action === 'stop' && 'id' in message && typeof message.id === 'string') {
    const tab = nativeScriptState(panel).tabs.find(tab => tab.id === message.id && inProject(tab.cwd, cwd));
    if (!tab) throw invalid();
    panel.remove(tab.id);
    return true;
  }
  throw invalid();
}
