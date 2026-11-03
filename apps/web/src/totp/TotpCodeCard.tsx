import { t, useLanguage } from '../i18n';
import { Dropdown } from 'antd';
import { Copy, Github, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { TotpEntry } from '../types';
import { copyText } from '../components/copyText';

export function TotpCodeCard({ entry, code, now, onEdit, onDelete }: {
  entry: TotpEntry; code: string; now: number; onEdit: () => void; onDelete: () => void;
}) {
  useLanguage();
  const seconds = entry.period - Math.floor(now / 1000) % entry.period;
  const split = code.length / 2;
  const formatted = code ? `${code.slice(0, split)} ${code.slice(split)}` : t("client.accounts.unavailable");
  const copy = () => { if (code) void copyText(t("client.accounts.verificationCode"), code); };
  return <article className="verification-card">
    <header><span className={`verification-service ${entry.issuer.toLowerCase() === 'github' ? 'github' : ''}`}>
      {entry.issuer.toLowerCase() === 'github' ? <Github size={30} />
        : Array.from(entry.issuer.trim())[0]?.toLocaleUpperCase() ?? '?'}</span>
      <div><h2>{entry.issuer || t("client.settings.untitled")}</h2><p>{entry.accountName}</p></div>
      <Dropdown trigger={['click']} menu={{ items: [
        { key: 'edit', label: t("client.settings.editKey"), icon: <Pencil size={16} />, onClick: onEdit },
        { key: 'delete', label: t("client.settings.deleteKey"), icon: <Trash2 size={16} />, danger: true, onClick: onDelete },
      ] }}><button type="button" className="icon-button" aria-label={t("client.settings.manage2faKeyFor", { value1: entry.issuer })}>
        <MoreHorizontal size={21} /></button></Dropdown></header>
    <div className="verification-code-body">
      <button className="verification-code" type="button" onClick={copy} disabled={!code}
        aria-label={t("client.settings.copyCode", { value1: entry.issuer })}>
        <span><strong>{formatted}</strong><small>{seconds}  {t("client.accounts.s")}</small></span>
        <span className="verification-progress"><i style={{ width: `${seconds / entry.period * 100}%` }} /></span>
      </button>
      <button className="verification-copy" type="button" onClick={copy} disabled={!code}
        aria-label={t("client.settings.copyCodeToClipboard", { value1: entry.issuer })}><Copy size={20} /><span>{t("client.projectBrowser.copied")}</span></button>
    </div>
  </article>;
}
