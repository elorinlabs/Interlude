import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import styles from './SidebarSearchInput.module.less';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  clearLabel: string;
  disabled?: boolean;
  inset?: boolean;
  onFocus?: () => void;
  onSubmit?: () => void;
}

/** Search directly in the sidebar without moving focus into an overlay. */
export function SidebarSearchInput({ value, onChange, label, clearLabel, disabled,
  inset, onFocus, onSubmit }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const clear = () => { onChange(''); input.current?.focus(); };
  return <form className={`${styles.search} ${inset ? styles.inset : ''}`}
    onSubmit={event => { event.preventDefault(); onSubmit?.(); }}>
    <Search size={18} aria-hidden="true" />
    <input ref={input} aria-label={label} placeholder={label} value={value} disabled={disabled}
      onFocus={onFocus} onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === 'Escape' && value) { event.stopPropagation(); clear(); } }} />
    {value && <button type="button" aria-label={clearLabel} onClick={clear}>
      <X size={16} aria-hidden="true" />
    </button>}
  </form>;
}
