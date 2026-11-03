import { displayText, displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { useEffect, useState, type RefObject } from 'react';
import { Box, Camera, File, Folder, Image, X } from 'lucide-react';
import type { Skill } from './types';
import type { ComposerPlugin } from '../../../desktop/src/pages/codexGui/attachmentTypes';
import type { RemoteComposerCatalog } from '../../../../shared/remote-chat/composerCatalog';
import { skillDescription, skillLabel, type SkillCatalogState } from '../../../../shared/chat/skillCatalog';
import { useComposerMenuKeyboard, type ComposerMenuOption } from './useComposerMenuKeyboard';

export type ComposerAddAction = 'camera' | 'photos' | 'file' | 'projectFiles' | 'projectPhotos' | 'plugins';
const ADD_ACTIONS = [
  { id: 'camera', get label() { return t("client.chat.takePhoto"); }, icon: Camera }, { id: 'photos', get label() { return t("client.chat.photos"); }, icon: Image },
  { id: 'file', get label() { return t("client.chat.files.39932f"); }, icon: File }, { id: 'projectFiles', get label() { return t("client.projectBrowser.projectFiles"); }, icon: Folder },
  { id: 'projectPhotos', get label() { return t("client.chat.projectPhotos"); }, icon: Image }, { id: 'plugins', get label() { return t("client.chat.plugins"); }, icon: Box },
] as const;

export function ComposerAddMenu({ busy, choose }: { busy: boolean; choose: (action: ComposerAddAction) => void }) {
  useLanguage();
  return <div className="chat-add-menu" role="menu" aria-label={t("client.chat.addContent")}>
    {ADD_ACTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="menuitem"
      disabled={busy} onClick={() => choose(id)}><Icon size={20} /><span>{label}</span></button>)}
  </div>;
}

interface CommandProps {
  input: RefObject<HTMLTextAreaElement>;
  catalog: SkillCatalogState; query: string; skillsOnly: boolean; compactReason: string | null;
  choose: (skill: Skill) => void; compact: () => void; goal: () => void; close: () => void;
}
export function ChatCommandMenu({ catalog, query, skillsOnly, compactReason, choose, compact, goal,
  close, input }: CommandProps) {
  const language = useLanguage();
  const search = query.toLocaleLowerCase();
  const skills = catalog.skills.filter(skill =>
    `${skill.name} ${skillLabel(skill)} ${skillDescription(skill, language)}`.toLocaleLowerCase().includes(search));
  const showCompact = !skillsOnly && t("client.chat.compactContext").includes(search);
  const showGoal = !skillsOnly && t("client.chat.goalKeepWorking").includes(search);
  const options: ComposerMenuOption[] = [
    ...(showCompact ? [{ key: 'compact', enabled: compactReason === null, choose: compact }] : []),
    ...(showGoal ? [{ key: 'goal', enabled: true, choose: goal }] : []),
    ...skills.map(skill => ({ key: skill.path, enabled: skill.enabled, choose: () => choose(skill) })),
  ];
  const keyboard = useComposerMenuKeyboard({ input, query, options, close });
  return <div className="chat-command-menu" aria-label={t("client.chat.commandsAndSkills")}>
    <header><strong>{t("client.chat.commandsAndSkills")}</strong><button type="button" aria-label={t("client.chat.closeCommandsAndSkills")} onClick={close}>
      <X size={16} /></button></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu">
      {showCompact && <button type="button" role="menuitem" aria-label={t("client.chat.compactContext.d36946")}
        {...keyboard.optionProps('compact')}
        disabled={compactReason !== null} onClick={compact}><strong>{t("client.chat.compact")} <small>/compact</small></strong>
        <small>{compactReason ? displayText(compactReason) : t("client.chat.compactThisConversationSContext")}</small></button>}
      {showGoal && <button type="button" role="menuitem" aria-label={t("client.chat.goalMode")} onClick={goal}
        {...keyboard.optionProps('goal')}>
        <strong>{t("client.chat.goal")} <small>/goal</small></strong><small>{t("client.chat.keepWorkingUntilTheGoalIsComplete")}</small></button>}
      {skills.map(skill => <button key={skill.path} type="button" role="menuitem" {...keyboard.optionProps(skill.path)}
        aria-label={t("client.chat.useSkill", { value1: skillLabel(skill) })} disabled={!skill.enabled} onClick={() => choose(skill)}>
        <strong>{skillLabel(skill)}{!skill.enabled && t("client.chat.disabled")}</strong>
        <small>{skillDescription(skill, language)}</small></button>)}
      {catalog.loading && !catalog.loaded && <p role="status">{t("client.chat.loadingSkills")}</p>}
      {catalog.error && <p role="status">{displayError(catalog.error)}</p>}
      {catalog.loaded && !skills.length && !showCompact && !showGoal && <p>{t("client.chat.noMatchingCommandsOrSkills")}</p>}
    </div>
  </div>;
}

export function ComposerPluginMenu({ catalog, query, load, chooseSkill, choosePlugin, input, close }: {
  input: RefObject<HTMLTextAreaElement>; close: () => void;
  catalog: SkillCatalogState; query: string; load: () => Promise<RemoteComposerCatalog>;
  chooseSkill: (skill: Skill) => void; choosePlugin: (plugin: ComposerPlugin) => void;
}) {
  useLanguage();
  const [result, setResult] = useState<RemoteComposerCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void load().then(value => { if (!cancelled) { setResult(value); setError(value.pluginsError ?? ''); } })
      .catch(() => { if (!cancelled) setError(t("client.chat.couldNotUpdatePluginsYouCanStillChooseExistingItems")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);
  const skills = result?.data.flatMap(group => group.skills) ?? catalog.skills;
  const entries = [
    ...(result?.plugins ?? []).filter(plugin => plugin.installed && plugin.enabled).map(plugin => ({
      key: `plugin:${plugin.id}`, label: plugin.interface?.displayName || plugin.name,
      name: plugin.name, action: () => choosePlugin(plugin), type: t("client.chat.plugins"),
    })),
    ...skills.filter(skill => skill.enabled).map(skill => ({ key: skill.path, label: skillLabel(skill),
      name: skill.name, action: () => chooseSkill(skill), type: t("client.chat.skills") })),
  ].filter(entry => `${entry.label} ${entry.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const keyboard = useComposerMenuKeyboard({ input, query, close,
    options: entries.map(entry => ({ key: entry.key, enabled: true, choose: entry.action })) });
  return <div className="chat-command-menu" aria-label={t("client.chat.pluginList")}><header><strong>{t("client.chat.plugins")}</strong></header>
    <div ref={keyboard.list} id={keyboard.id} className="chat-menu-options" role="menu">
      {entries.map(entry => <button type="button" role="menuitem" {...keyboard.optionProps(entry.key)}
      key={entry.key} aria-label={t("client.chat.use.e0049a", { value1: entry.type, value2: entry.label })} onClick={entry.action}>
      <span className="chat-row"><Box size={20} />{entry.label}</span></button>)}
      {loading && !entries.length && <p role="status">{t("client.chat.loadingPlugins")}</p>}
      {!loading && !entries.length && !error && <p>{query ? t("client.chat.noMatchingPlugins") : t("client.chat.noPluginsOrSkillsAvailable")}</p>}
      {error && <p role="status">{displayError(error)}</p>}
    </div></div>;
}
