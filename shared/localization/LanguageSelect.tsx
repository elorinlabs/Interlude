import { Select } from 'antd';
import './languageSelect.css';

interface Props<Language extends string> {
  id?: string;
  label: string;
  value: Language;
  options: readonly { value: Language; label: string }[];
  onChange: (language: Language) => void;
  size?: 'small' | 'middle';
}

export function LanguageSelect<Language extends string>({ id, label, value, options, onChange, size }: Props<Language>) {
  return <Select<Language> id={id} aria-label={label} className="interface-language-select"
    value={value} options={[...options]} onChange={onChange} size={size}
    virtual={false} classNames={{ popup: { root: 'interface-language-options' } }} />;
}
