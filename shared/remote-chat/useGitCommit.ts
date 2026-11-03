import { useEffect, useRef, useState } from 'react';
import { getInterfaceLanguage } from "../localization/interfaceLanguage";
import type { GitChanges, GitClient, GitRepository } from './gitTypes';
import { useGitSettings } from './useGitSettings';

interface Options {
  client: GitClient; cwd: string; scope: object; changes: GitChanges | null; repository: GitRepository | null;
  selected: Record<string, string>; enabled: boolean; busy: boolean; isCurrent: () => boolean;
  run: (action: () => Promise<void>) => Promise<void>; load: () => Promise<void>;
  setNotice: (notice: string) => void; onCommitted: () => void;
}

/** Generation and commit share one request gate and the exact same selected-file snapshot. */
export function useGitCommit(options: Options) {
  const { client, cwd, scope, changes, repository, selected, enabled, busy, isCurrent,
    run, load, setNotice, onCommitted } = options;
  const [message, setMessage] = useState('');
  const preferences = useGitSettings(client, enabled);
  const { autoMessage, settingsBusy } = preferences;
  const [generatingMessage, setGeneratingMessage] = useState(false);
  const available = useRef(enabled);
  available.current = enabled;
  useEffect(() => { setMessage(''); setGeneratingMessage(false); }, [scope]);
  const canGenerateMessage = enabled && !busy && !settingsBusy && !!changes && Object.keys(selected).length > 0
    && !changes.files.some(file => file.conflict);
  const canPush = !!changes?.branch && !!repository?.upstream && !!repository.remotes.length;
  const canCommit = canGenerateMessage && (autoMessage || !!message.trim());
  const snapshot = () => ({ cwd, head: changes!.head,
    files: Object.entries(selected).map(([path, version]) => ({ path, version })) });
  const generate = async (input: ReturnType<typeof snapshot>) => {
    setGeneratingMessage(true);
    try {
      const result = await client.generateMessage({ ...input, language: getInterfaceLanguage() });
      if (!result.message.trim() || result.message.length > 4000) {
        throw new Error('未能生成提交说明，请重试或手动填写。');
      }
      return result.message.trim();
    } finally { if (isCurrent()) setGeneratingMessage(false); }
  };
  const generateMessage = () => {
    if (!canGenerateMessage || autoMessage || message.trim()) return Promise.resolve();
    const input = snapshot();
    return run(async () => {
      const generated = await generate(input);
      if (isCurrent() && available.current) setMessage(generated);
    });
  };
  const commit = (settings: { push?: boolean } = {}) => {
    if (!canCommit || (settings.push && !canPush)) return Promise.resolve();
    const input = snapshot();
    return run(async () => {
      const commitMessage = autoMessage ? await generate(input) : message.trim();
      if (!isCurrent() || !available.current) return;
      if (autoMessage) setMessage(commitMessage);
      const result = await client.commit({ ...input, message: commitMessage });
      if (!isCurrent()) return;
      onCommitted(); setMessage(''); setNotice(`已提交 ${result.hash.slice(0, 8)}`);
      let failure: unknown;
      if (settings.push) {
        try {
          await client.action({ cwd, action: 'push', head: result.hash, branch: changes!.branch });
          if (isCurrent()) setNotice('提交并推送完成');
        } catch (error) {
          failure = error;
          if (isCurrent()) setNotice('提交已完成，推送未完成。请稍后重试推送。');
        }
      }
      if (!isCurrent()) return;
      try { await load(); } catch (error) { failure ??= error; }
      if (failure) throw failure;
    });
  };
  return { ...preferences, message, setMessage, generatingMessage, generateMessage,
    canGenerateMessage, commit, canCommit, canCommitAndPush: canCommit && canPush };
}
