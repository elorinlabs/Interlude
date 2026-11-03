import { uiText } from "../../../i18n/uiText";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from '@xterm/addon-web-links';
import { websiteUrl } from '../../../../../../shared/terminal/links';
import type { TerminalLinkTarget } from './TerminalLinkMenu';
import { connectTerminal } from "../../../../../../shared/terminal/connection";
import { terminalTheme } from "./theme";
import type { TerminalApi, TerminalInfo } from "../../../../../../shared/terminal/types";
import "@xterm/xterm/css/xterm.css";
import { bindSshDirectory } from '../../../../../../shared/terminal/sshDirectory';
import { useZmodemTransfer } from '../../../../../../shared/terminal/useZmodemTransfer';

export function useTerminalSession({ cwd, visible, api, session, npmScript, onExit, onLink }: {
  cwd: string; visible: boolean; api: TerminalApi; session?: TerminalInfo; onLink: (link: TerminalLinkTarget) => void;
  npmScript?: string; onExit?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal>();
  const [info, setInfo] = useState<TerminalInfo>();
  const [status, setStatus] = useState(uiText("client.chat.openingTerminal"));
  const linkHandler = useRef(onLink);
  const transfer = useZmodemTransfer(api, session);
  linkHandler.current = onLink;
  const exitHandler = useRef(onExit);
  exitHandler.current = onExit;
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const activate = (event: MouseEvent, url: string) => {
      event.preventDefault();
      if (websiteUrl(url)) linkHandler.current({ url, x: event.clientX, y: event.clientY });
    };
    const terminal = new Terminal({ cursorBlink: true, fontSize: 13, scrollback: 5000, linkHandler: { activate },
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace', allowTransparency: false,
      theme: terminalTheme(document.documentElement.dataset.theme === "dark") });
    terminalRef.current = terminal;
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(element);
    terminal.loadAddon(new WebLinksAddon(activate));
    if (element.clientWidth && element.clientHeight) fit.fit();
    const directory = session?.ssh ? bindSshDirectory({ id: session.id, terminal,
      write: data => connection.input(data) }) : undefined;
    const output = (data: number[]) => {
      if (directory) directory.output(data); else terminal.write(new Uint8Array(data));
    };
    const zmodem = transfer.bind(output);
    const connection = connectTerminal({ api, cwd, session, npmScript, size: { cols: terminal.cols, rows: terminal.rows },
      onReady: (value) => { setInfo(value); setStatus(""); }, onError: setStatus,
      onStartFailed: () => exitHandler.current?.(),
      onEvent: (event) => {
        if (event.type === "output") {
          if (zmodem) zmodem.output(event.data); else output(event.data);
        }
        if (event.type === 'reset') { zmodem?.disconnect(); directory?.disconnect(); terminal.reset(); }
        if (event.type === 'connection') {
          if (!event.connected) { zmodem?.disconnect(); directory?.disconnect(); }
          terminal.options.disableStdin = !event.connected;
          setStatus(event.connected ? '' : uiText("client.terminal.connectionLostYouCanContinueWhenItReconnects"));
        }
        if (event.type === "error") setStatus(event.message);
        if (event.type === "exit") {
          exitHandler.current?.();
          zmodem?.disconnect();
          directory?.disconnect();
          terminal.options.disableStdin = true;
          setStatus(uiText("client.chat.thisTerminalHasEndedYouCanOpenANewOne"));
        }
      } });
    const input = terminal.onData(data => {
      if (zmodem?.busy) { if (data === '\x03') zmodem.cancel(); return; }
      directory?.input(); connection.input(data);
    });
    // xterm also emits internal flags that the terminal request does not accept.
    const resize = terminal.onResize(({ cols, rows }) => connection.resize({ cols, rows }));
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (element.clientWidth && element.clientHeight) fit.fit(); });
    });
    observer.observe(element);
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = terminalTheme(document.documentElement.dataset.theme === "dark");
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    terminal.attachCustomKeyEventHandler((event) => handleClipboard(event, terminal, setStatus));
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); themeObserver.disconnect();
      zmodem?.dispose(); directory?.dispose(); input.dispose(); resize.dispose(); connection.dispose();
      terminal.dispose(); terminalRef.current = undefined;
    };
  }, [cwd, api, session, npmScript, transfer.bind]);
  useEffect(() => { if (visible) terminalRef.current?.focus(); }, [visible]);
  return { host, info, status, transfer, input: (data: string) => terminalRef.current?.input(data, true) };
}

function handleClipboard(event: KeyboardEvent, terminal: Terminal, report: (message: string) => void) {
  if (event.type !== "keydown" || !(event.ctrlKey || event.metaKey)) return true;
  if (event.key.toLowerCase() === "c" && terminal.hasSelection()) {
    event.preventDefault();
    void navigator.clipboard.writeText(terminal.getSelection()).catch(() => report(uiText("client.chat.couldNotCopyTryAgain")));
    return false;
  }
  if (event.key.toLowerCase() === "v" && event.shiftKey) {
    event.preventDefault();
    void navigator.clipboard.readText().then((text) => terminal.paste(text)).catch(() => report(uiText("client.chat.couldNotPasteTryAgain")));
    return false;
  }
  return true;
}
