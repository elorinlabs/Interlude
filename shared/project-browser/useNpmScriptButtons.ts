import { useContext, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Compartment, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { interpolate } from '@interlude/i18n';
import { NpmScriptContext } from '../terminal/TerminalWorkspaceProvider';
import { terminalDirectory } from './terminalDirectory';
import { npmScriptButtons } from './npmScriptButtons';
import { isPackageJson } from './npmScripts';
import type { BrowserTranslate } from './ProjectTree';
import { terminalProjectKey } from '../remote-chat/terminalProject';

interface Options {
  path: string; disabled: boolean; plainText: boolean; t: BrowserTranslate;
  prepare?: () => Promise<boolean>;
}

export function useNpmScriptButtons(view: MutableRefObject<EditorView | undefined>, options: Options) {
  const panel = useContext(NpmScriptContext);
  const compartment = useRef(new Compartment());
  const pending = useRef(new Set<string>());
  const [revision, refresh] = useState(0);
  const canRun = !!options.prepare;
  const runLabel = options.t('client.npmScripts.run');
  const stopLabel = options.t('client.npmScripts.stop');
  const latest = useRef({ panel, options });
  latest.current = { panel, options };
  const running = (name: string) => {
    const { panel, options } = latest.current;
    const cwd = terminalProjectKey(directory(options.path));
    return panel?.tabs.find(tab => !tab.exited && !tab.session?.exited
      && (tab.npmScript ?? tab.session?.npmScript) === name
      && terminalProjectKey(tab.session?.npmScriptCwd ?? tab.cwd) === cwd);
  };
  const toggle = async (name: string) => {
    const { panel, options } = latest.current;
    if (!panel || options.disabled || panel.busy || pending.current.has(name)) return;
    const tab = running(name);
    if (tab) { panel.remove(tab.id); return; }
    pending.current.add(name); refresh(value => value + 1);
    try {
      if (options.prepare && !await options.prepare()) return;
      if (!latest.current.options.disabled) latest.current.panel?.addInDirectory(directory(options.path), name);
    } finally { pending.current.delete(name); refresh(value => value + 1); }
  };
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const enabled = panel && canRun && isPackageJson(options.path) && !options.plainText;
    const extension = enabled ? npmScriptButtons(name => {
      const active = !!running(name);
      return { name, running: active, disabled: options.disabled || !!panel.busy || pending.current.has(name),
        label: interpolate(active ? stopLabel : runLabel, { name }),
        toggle: () => { void toggle(name); } };
    }) : [];
    const slot = compartment.current;
    editor.dispatch({ effects: slot.get(editor.state) === undefined
      ? StateEffect.appendConfig.of(slot.of(extension)) : slot.reconfigure(extension) });
  }, [panel, options.path, options.disabled, options.plainText, runLabel, stopLabel, canRun, revision]);
}

const directory = (path: string) => terminalDirectory({ path, name: 'package.json', directory: false });
