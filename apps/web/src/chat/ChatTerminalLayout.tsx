import { createContext, useState, type ReactNode } from 'react';

export const ChatTerminalHostContext = createContext<HTMLDivElement | null>(null);

/** Dock header-launched terminals after the composer, within the same conversation. */
export function ChatTerminalLayout({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <ChatTerminalHostContext.Provider value={host}>
    <div ref={setHost} className="chat-conversation">{children}</div>
  </ChatTerminalHostContext.Provider>;
}
