import { t, useLanguage } from '../i18n';
import { ArrowLeft, Box, FileText, Github, Globe } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { SettingsRow } from './SettingsRow';
import { version } from '../../../../package.json';

export function AboutPage({ onBack }: { onBack: () => void }) {
  useLanguage();
  return <div className="page-body settings-page about-page">
    <header className="settings-navigation"><button type="button" className="icon-button"
      aria-label={t("client.downloads.backToSettings")} onClick={onBack}><ArrowLeft size={22} /></button><h1>{t("client.settings.about")}</h1></header>
    <section className="settings-group about-identity">
      <BrandMark />
      <div><h2>Interlude <small>Web</small></h2><p>v{version}</p></div>
      <p>{t("client.settings.manageAccountUsageAndConnectToYourComputersFromAnywhere")}</p>
    </section>
    <section className="settings-group">
      <SettingsRow label={t("client.settings.version")} value={`v${version}`} icon={Box} tone="blue" />
      <SettingsRow label={t("client.settings.platform")} value={t("client.settings.webBrowser")} icon={Globe} tone="blue" />
      <SettingsRow label={t("client.settings.license")} value="Apache-2.0" icon={FileText} tone="orange" />
    </section>
    <section className="settings-group"><a className="settings-link"
      href="https://github.com/piperhex/remoteai/releases"
      target="_blank" rel="noreferrer"><Github size={21} /><span>{t("client.settings.sourceCodeAndReleases")}</span></a></section>
    <p className="settings-hint">{t("client.settings.theWebAppUpdatesAutomaticallyNoDownloadNeeded")}</p>
  </div>;
}
