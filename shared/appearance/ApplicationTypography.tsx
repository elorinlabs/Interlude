import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import { useApplicationFontSize } from './useApplicationFontSize';
import './typography.css';

export function ApplicationTypography({ children }: { children: ReactNode }) {
  const fontSize = useApplicationFontSize();
  return <ConfigProvider theme={{ token: { fontSize } }}>{children}</ConfigProvider>;
}
