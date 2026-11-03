import { displayText, displayError } from '../../i18n/index';
import { Activity, Check, Image, Info, Monitor, Mouse, PanelsTopLeft, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { MAX_FPS } from '../../../../../shared/remote-desktop/protocol';
import { displayLabel, displayName } from '../../../../../shared/remote-desktop/displays';
import { FRAME_RATE_OPTIONS, MOUSE_INSTRUCTIONS, QUALITY_OPTIONS, type DisplaySettingsProps }
  from '../../../../../shared/remote-desktop/displaySettings';
import { useFrameRateInput } from '../../../../../shared/remote-desktop/useFrameRateInput';
import { t } from '../../i18n';
import './displaySettings.css';

function Section({ icon: Icon, title, description, children }: {
  icon: LucideIcon; title: string; description: string; children: ReactNode;
}) {
  return <section className="rd-display-section" aria-label={displayText(title)}>
    <div className="rd-display-section-heading"><Icon size={21} aria-hidden="true" />
      <div><h3>{displayText(title)}</h3><span className="rd-display-description">{displayText(description)}</span></div>
    </div>{children}
  </section>;
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="rd-display-hint"><Info size={15} aria-hidden="true" /><span>{children}</span></div>;
}

function Monitors({ displays, settings, saving, update, stats }: DisplaySettingsProps) {
  return <Section icon={Monitor} title="client.remoteDesktop.monitor" description="client.remoteDesktop.chooseTheMonitorToUse">
    {displays.length > 0 && <div className="rd-monitor-grid" role="group" aria-label={t("client.remoteDesktop.monitor")}>
      {displays.map(item => <button key={item.id} className="rd-monitor-card" disabled={saving}
        aria-label={displayLabel(item, displayText)} aria-pressed={settings.displayId === item.id}
        onClick={() => { void update({ ...settings, displayId: item.id }); }}>
        <span className="rd-monitor-check" aria-hidden="true">
          {settings.displayId === item.id && <Check size={12} strokeWidth={3} />}</span>
        <span className="rd-monitor-preview" aria-hidden="true"><span /></span>
        <span className="rd-monitor-name">{displayName(item, displayText)}{item.primary && `（${t("client.remoteDesktop.primary")}）`}</span>
        <span className="rd-monitor-resolution">{item.width} × {item.height}</span>
      </button>)}
    </div>}
    <button className="rd-stats-toggle" role="switch" aria-label={t("client.remoteDesktop.hideConnectionStats")}
      aria-checked={!stats.visible} onClick={stats.toggle}>
      <PanelsTopLeft size={20} aria-hidden="true" /><span className="rd-stats-toggle-copy">
        <span>{t("client.remoteDesktop.hideConnectionStats")}</span><span className="rd-display-description">{t("client.remoteDesktop.keepConnectionStatsOffTheScreen")}</span>
      </span><span className="rd-display-switch" aria-hidden="true"><span /></span>
    </button>
  </Section>;
}

function FrameRate(props: DisplaySettingsProps) {
  const { settings, saving, update } = props;
  const input = useFrameRateInput(props);
  return <Section icon={Activity} title="client.remoteDesktop.frameRate" description="client.remoteDesktop.higherFrameRatesMakeMotionSmootherAndUseMoreBandwidth">
    <div className="rd-display-options rd-frame-options" role="group" aria-label={t("client.remoteDesktop.frameRate")}>
      {FRAME_RATE_OPTIONS.map(fps => <button key={fps} disabled={saving}
        aria-pressed={settings.fps === fps} onClick={() => { void update({ ...settings, fps }); }}>
        {fps === 'auto' ? t("client.mobile.auto") : `${fps} ${t("client.remoteDesktop.fps")}`}</button>)}
    </div>
    <form className="rd-frame-input" noValidate
      onSubmit={event => { event.preventDefault(); if (!saving) input.apply(); }}>
      <input type="number" min={1} max={MAX_FPS} step={1} value={input.custom}
        aria-label={t("client.remoteDesktop.customFrameRate")} aria-invalid={!!input.error} aria-describedby="rd-frame-feedback"
        onChange={event => input.edit(event.target.value)} />
      <span>{t("client.remoteDesktop.fps")}</span><button type="submit" disabled={saving} aria-label={t("client.remoteDesktop.applyFrameRate")}>{t("client.chat.apply")}</button>
    </form>
    <div id="rd-frame-feedback">{input.error
      ? <div className="rd-display-error" role="alert">{displayError(input.error)}</div>
      : <Hint>{t("client.remoteDesktop.choose1144FpsActualPerformanceDependsOnYourNetwork")}</Hint>}</div>
  </Section>;
}

function Resolution({ resolution, settings, displays, saving }: DisplaySettingsProps) {
  const current = displays.find(display => display.id === settings.displayId);
  const value = current ? `${current.width}x${current.height}` : '';
  const supported = resolution?.options.some(size => `${size.width}x${size.height}` === value);
  return <Section icon={Monitor} title="client.remoteDesktop.resolution" description="client.remoteDesktop.changeTheRemoteDesktopResolution">
    {resolution?.options.length ? <select className="rd-resolution-select" aria-label={t("client.remoteDesktop.resolution")}
      value={value} disabled={saving} onChange={event => {
        const size = resolution.options.find(option => `${option.width}x${option.height}` === event.target.value);
        if (size && event.target.value !== value) void resolution.change(size);
      }}>
      {!supported && <option value={value} disabled>
        {current ? `${current.width} × ${current.height}` : t("client.remoteDesktop.chooseAResolution")}</option>}
      {resolution.options.map(size => <option key={`${size.width}x${size.height}`} value={`${size.width}x${size.height}`}>
        {size.width} × {size.height}</option>)}
    </select> : <Hint>{t("client.settings.resolutionChangesAreUnavailableOnThisComputer")}</Hint>}
  </Section>;
}

export function DisplaySettings(props: DisplaySettingsProps) {
  const { settings, saving, update, close } = props;
  return <aside className="rd-settings rd-display-settings" aria-label={t("client.remoteDesktop.displaySettings")}>
    <header className="rd-display-header"><Monitor size={30} aria-hidden="true" />
      <div><h2>{t("client.remoteDesktop.display")}</h2><span className="rd-display-description">{t("client.remoteDesktop.adjustHowYourRemoteDesktopLooks")}</span></div>
      <button className="rd-display-close" onClick={close} aria-label={t("client.mobile.closeDisplaySettings")}>
        <X size={22} aria-hidden="true" /></button>
    </header>
    <div className="rd-display-scroll" tabIndex={0} role="region" aria-label={t("client.remoteDesktop.displaySettingsOptions")}>
      <Monitors {...props} />
      <Resolution {...props} />
      <FrameRate {...props} />
      <Section icon={Image} title="client.remoteDesktop.quality" description="client.remoteDesktop.balanceClaritySmoothnessAndBandwidth">
        <div className="rd-display-options" role="group" aria-label={t("client.remoteDesktop.quality")}>
          {QUALITY_OPTIONS.map(item => <button key={item.value} disabled={saving}
            aria-pressed={settings.quality === item.value}
            onClick={() => { void update({ ...settings, quality: item.value }); }}>{t(item.label)}</button>)}
        </div><Hint>{t("client.remoteDesktop.autoStartsAtTheHighestQualityAnd60FpsIf")}</Hint>
      </Section>
      <Section icon={Mouse} title="client.remoteDesktop.mouseControls" description="client.remoteDesktop.howToUseTheMouseOnYourRemoteDesktop">
        <ul className="rd-mouse-instructions">{MOUSE_INSTRUCTIONS.map(text => <li key={text}>{displayText(text)}</li>)}</ul>
      </Section>
    </div>
  </aside>;
}
