import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  className?: string;
}

export function ChatConnectionAction({ children, label, onClick, disabled, expanded, className = '' }: Props) {
  return <button type="button" aria-label={label} disabled={disabled} aria-expanded={expanded}
    className={`chat-connection ${className}`} onClick={onClick}>{children}</button>;
}
