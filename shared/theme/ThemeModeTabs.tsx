import { Segmented } from 'antd';
import { Moon, Sun } from 'lucide-react';
import { THEME_OPTIONS, type ThemeMode } from './mode';
import './themeModeTabs.css';

type ThemeLabelKey = typeof THEME_OPTIONS[number]['label'] | 'client.workspaceSettings.appearance';

interface Props {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  t: (key: ThemeLabelKey) => string;
}

export function ThemeModeTabs({ mode, onChange, t }: Props) {
  return <Segmented<ThemeMode> className="theme-mode-tabs" value={mode} onChange={onChange}
    aria-label={t('client.workspaceSettings.appearance')}
    options={THEME_OPTIONS.map(({ value, label }) => ({
      value,
      label: <span className="theme-mode-tabs-label">
        {value === 'light' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        {t(label)}
      </span>,
    }))} />;
}
