import { Button, InputNumber, Slider } from 'antd';
import { RotateCcw, Type } from 'lucide-react';
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from './fontSize';
import './fontSizeControl.css';

interface Props {
  value: number; onChange: (value: number) => void; label: string; resetLabel: string;
}

export function FontSizeControl({ value, onChange, label, resetLabel }: Props) {
  return <div className="font-size-control">
    <Type size={16} aria-hidden="true" />
    <Slider min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} value={value} onChange={onChange}
      ariaLabelForHandle={label} tooltip={{ open: false }} />
    <InputNumber aria-label={label} min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} precision={0}
      value={value} onChange={size => { if (size !== null) onChange(size); }} suffix="px" />
    <Button icon={<RotateCcw size={13} />} onClick={() => onChange(DEFAULT_FONT_SIZE)}
      disabled={value === DEFAULT_FONT_SIZE}>{resetLabel}</Button>
  </div>;
}
