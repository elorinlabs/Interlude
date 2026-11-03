import { displayText } from '../../i18n/index';
import { useEffect, useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { DesktopInput, DesktopPlatform } from '../../../../../shared/remote-desktop/protocol';
import { desktopShortcuts, desktopModifiers, INPUT_TABS, KEYBOARD_PAGES }
  from '../../../../../shared/remote-desktop/softKeyboard';
import { useSoftKeyboard } from '../../../../../shared/remote-desktop/useSoftKeyboard';
import { bindDesktopIme } from '../../../../../shared/remote-desktop/ime';
import { t } from '../../i18n';
import './keyboard.css';

function DesktopIme({ input, field }: {
  input: (event: DesktopInput) => void; field: RefObject<HTMLTextAreaElement>;
}) {
  const send = useRef(input); send.current = input;
  useEffect(() => {
    if (field.current) return bindDesktopIme(field.current, event => send.current(event));
  }, []);
  return <textarea ref={field} autoFocus rows={1} maxLength={1000} className="rd-ime"
    autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
    aria-label={t("client.remoteDesktop.textToSendToYourComputer")} placeholder={t("client.remoteDesktop.typeToSendDirectlyToYourComputer")} />;
}

export function DesktopKeyboard({ input, close, supported, platform, mobile = false }: {
  input: (event: DesktopInput) => void; close: () => void; supported: boolean;
  platform?: DesktopPlatform; mobile?: boolean;
}) {
  const keyboard = useSoftKeyboard(input);
  const field = useRef<HTMLTextAreaElement>(null);
  return <section className={`rd-keyboard${mobile ? ' rd-keyboard-mobile' : ''}`} aria-label={t("client.remoteDesktop.remoteInput")}>
    <div className="rd-input-tabs">
      <div role="tablist" aria-label={t("client.remoteDesktop.inputMode")}>
        {INPUT_TABS.map(tab => <button key={tab.id} role="tab" aria-selected={keyboard.tab === tab.id}
          onClick={() => {
            keyboard.selectTab(tab.id);
            if (tab.id === 'ime') field.current?.focus({ preventScroll: true });
          }}>{t(tab.label)}</button>)}
      </div>
      <button className="rd-keyboard-close" aria-label={t("client.remoteDesktop.hideKeyboard")} onClick={close}><X size={23} /></button>
    </div>
    {keyboard.tab === 'ime' ? <DesktopIme input={input} field={field} />
      : <div className="rd-keyboard-content">
        {!supported && <p className="rd-keyboard-notice" role="status">
          {t("client.remoteDesktop.updateTheAppOnTheRemoteComputerToUseThese")}</p>}
        {keyboard.tab === 'shortcuts' ? <div className="rd-shortcuts">
          {desktopShortcuts(platform).map(shortcut => <button key={shortcut.label} disabled={!supported}
            onClick={() => keyboard.shortcut(shortcut.codes)}>
            <span>{shortcut.label}</span><small>{displayText(shortcut.description)}</small>
          </button>)}
        </div> : <div className="rd-computer-keys">
          <div className="rd-key-row">
            <label className="rd-combination"><input type="checkbox" checked={keyboard.combination}
              onChange={keyboard.toggleCombination} />{t("client.remoteDesktop.keyCombinations")}</label>
            {desktopModifiers(platform).map(key => <button key={key.code}
              aria-pressed={keyboard.modifiers.includes(key.code)}
              disabled={!supported} onClick={() => keyboard.modifier(key.code)}>{key.label}</button>)}
          </div>
          {KEYBOARD_PAGES[keyboard.page].map((row, index) => <div key={index} className="rd-key-row">
            {row.map(key => <button key={key.code} disabled={!supported} style={{ flex: key.weight ?? 1 }}
              onClick={() => keyboard.press(key.code)}>{key.label}</button>)}
          </div>)}
          <div className="rd-key-pages">{KEYBOARD_PAGES.map((_, index) => <button key={index}
            aria-label={t(index === 0 ? "client.remoteDesktop.letterKeys" : "client.remoteDesktop.symbolsAndFunctionKeys")} aria-pressed={keyboard.page === index}
            onClick={() => keyboard.setPage(index)}><span /></button>)}</div>
        </div>}
      </div>}
  </section>;
}
