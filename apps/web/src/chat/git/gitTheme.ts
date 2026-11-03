import { theme } from 'antd';
import type { CSSProperties } from 'react';
import type { GitArea } from '../../../../../shared/remote-chat/gitFiles';

/** Put tokens on the drawer portal so desktop and Web share the active Ant Design theme. */
export function useGitTheme(matchWorkspace = false): CSSProperties {
  const { token } = theme.useToken();
  const workspaceColor = (name: string, fallback: string) => matchWorkspace ? `var(${name}, ${fallback})` : fallback;
  // Small status labels need more contrast than the default accent hues in either theme.
  const statusColor = (color: string) => `color-mix(in srgb, ${color} 70%, ${token.colorText} 30%)`;
  return {
    '--git-ink': workspaceColor('--ink', token.colorText),
    '--git-muted': workspaceColor('--muted', token.colorTextSecondary),
    '--git-border': workspaceColor('--line', token.colorBorder),
    '--git-surface': workspaceColor('--panel', token.colorBgContainer),
    '--git-subtle': workspaceColor('--bg', token.colorFillQuaternary),
    '--git-hover': token.colorFillTertiary,
    '--git-accent': workspaceColor('--green-dark', token.colorPrimaryText),
    '--git-accent-bg': workspaceColor('--green-soft', token.colorPrimaryBg),
    '--git-action': token.colorPrimary,
    '--git-on-action': token.colorTextLightSolid,
    '--git-focus': token.colorPrimaryBorder,
    '--git-error': token.colorErrorText,
    '--git-conflict': statusColor(token.colorErrorText),
    '--git-conflict-bg': token.colorErrorBg,
    '--git-unstaged': statusColor(token.colorInfoText),
    '--git-unstaged-bg': token.colorInfoBg,
    '--git-staged': statusColor(token.colorSuccessText),
    '--git-staged-bg': token.colorSuccessBg,
    '--git-mixed': statusColor(token.purple6),
    '--git-mixed-bg': token.purple1,
    '--git-untracked': statusColor(token.colorWarningText),
    '--git-untracked-bg': token.colorWarningBg,
    '--git-shadow': token.boxShadowSecondary,
  } as CSSProperties;
}

export function gitAreaColors(area: GitArea['id']): CSSProperties {
  return { color: `var(--git-${area})`, background: `var(--git-${area}-bg)` };
}

export function gitCommitColors(status: string): CSSProperties {
  const areas: Record<string, GitArea['id']> = {
    A: 'staged', M: 'unstaged', D: 'conflict', R: 'mixed', C: 'mixed', T: 'untracked',
  };
  return areas[status] ? gitAreaColors(areas[status])
    : { color: 'var(--git-muted)', background: 'var(--git-subtle)' };
}
