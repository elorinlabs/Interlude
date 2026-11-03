import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

export function SettingsRow({ label, value, icon: Icon, tone = 'green', onClick }: {
  label: string; value?: string; icon: LucideIcon; tone?: 'green' | 'blue' | 'orange' | 'gray'; onClick?: () => void;
}) {
  const content = <><span className={`settings-row-icon ${tone}`}><Icon size={21} /></span>
    <span className="settings-row-label">{label}</span><span className="settings-row-value">{value}</span>
    {onClick && <ChevronRight size={18} />}</>;
  return onClick ? <button type="button" className="settings-row" onClick={onClick}>{content}</button>
    : <div className="settings-row">{content}</div>;
}
