import { useEffect, useState, type RefObject } from 'react';
import { displayText as t } from '../localization/messages';
import { LOUNGE_EMOJI, loungeEmojiPanelHeight } from './emoji';

export function MobileLoungeEmojiPanel({ height, insert }: { height: number; insert: (emoji: string) => void }) {
  return <div id="lounge-mobile-emoji" className="lounge-mobile-emoji" role="group"
    aria-label={t('client.lounge.emoji')} style={{ height }}>
    <div className="lounge-mobile-emoji-content">
      <p>{t('client.lounge.emoji')}</p>
      <div className="lounge-mobile-emoji-grid">{LOUNGE_EMOJI.map(emoji => <button key={emoji} type="button"
        onPointerDown={event => event.preventDefault()} onClick={() => insert(emoji)}>{emoji}</button>)}</div>
    </div>
  </div>;
}

/** Reuse the last keyboard height; reserve only space the visual viewport has already released. */
export function useMobileEmojiHeight(active: boolean, input: RefObject<HTMLTextAreaElement | null>) {
  const [height, setHeight] = useState(() => loungeEmojiPanelHeight(window.innerHeight));
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    let fullHeight = window.innerHeight;
    let width = window.innerWidth;
    let rememberedHeight = 0;
    const update = () => {
      if (width !== window.innerWidth) {
        width = window.innerWidth; fullHeight = window.innerHeight; rememberedHeight = 0;
      }
      fullHeight = Math.max(fullHeight, window.innerHeight, viewport?.height ?? 0);
      const inset = Math.max(0, fullHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0));
      // Browser toolbar movement alone is too small to represent a software keyboard.
      if (inset > 100 && document.activeElement === input.current) rememberedHeight = inset;
      setHeight(Math.max(0, loungeEmojiPanelHeight(fullHeight, rememberedHeight) - inset));
    };
    update();
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [active, input]);
  return height;
}
