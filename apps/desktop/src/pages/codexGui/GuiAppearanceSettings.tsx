import { uiText } from "../../i18n/uiText";
import { useId, useState } from "react";
import { Switch } from "antd";
import { Type } from "lucide-react";
import { FontSizeControl } from "../../../../../shared/appearance/FontSizeControl";
import {
  guiFontStyle, saveGuiFontSize, setGuiFollowGlobal, useGuiFontSize, useGuiFollowGlobal,
} from "./guiAppearance";
import styles from "./GuiAppearanceSettings.module.less";

export function GuiAppearanceSettings() {
  const fontSize = useGuiFontSize();
  const followGlobal = useGuiFollowGlobal();
  const followId = useId();
  const [error, setError] = useState("");
  const update = (value: number) => {
    setError(saveGuiFontSize(value) ? ''
      : uiText('client.workspaceSettings.couldNotSaveTheFontSizePleaseTryAgain'));
  };
  return <section className={styles.panel} aria-label={uiText("client.workspaceSettings.appearanceSettings")}>
    <div className={styles.card}>
    <h3>{uiText("client.workspaceSettings.fontSize")}</h3>
    <p className={styles.hint}>{uiText("client.workspaceSettings.adjustTextSizeForConversationsTheComposerAndCodeChanges")}</p>
    <div className={styles.follow}>
      <div><label htmlFor={followId}>{uiText('client.appearance.followGlobalFont')}</label>
        <p className={styles.hint}>{uiText('client.appearance.followGlobalFontDescription')}</p></div>
      <Switch id={followId} checked={followGlobal} onChange={follow => {
        setError(setGuiFollowGlobal(follow) ? ''
          : uiText('client.workspaceSettings.couldNotSaveTheFontSizePleaseTryAgain'));
      }} />
    </div>
    <div className={styles.controls}>
      <FontSizeControl value={fontSize} onChange={update} label={uiText('client.workspaceSettings.fontSize')}
        resetLabel={uiText('client.chat.restoreDefaults')} />
    </div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.preview} style={guiFontStyle(fontSize)} aria-label={uiText("client.workspaceSettings.fontPreview")}>
      <span className={styles.caption}><Type size={14} aria-hidden="true" />{uiText("client.workspaceSettings.fontPreview")}</span>
      <p>{uiText("client.workspaceSettings.helloWhatWouldYouLikeToWorkOnToday")}</p>
      <p>{uiText("client.workspaceSettings.chooseAComfortableSizeForReadingAndWriting")}</p>
      <pre><code>const message = "Hello, Codex!";</code></pre>
    </div>
  </section>;
}
