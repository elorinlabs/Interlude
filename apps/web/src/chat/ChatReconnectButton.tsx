import { t, useLanguage } from '../i18n';
import { useEffect, useState } from 'react';
import { ChatConnectionAction } from './ChatConnectionAction';

export function ChatReconnectButton({ retryAt, onClick }: { retryAt: number | null; onClick: () => void }) {
  useLanguage();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <ChatConnectionAction className="chat-reconnect" label={t("client.chat.connectNow")} onClick={onClick}>
    {t("client.chat.connectNow")}{seconds === null ? '' : t("client.chat.s", { value1: seconds })}
  </ChatConnectionAction>;
}
