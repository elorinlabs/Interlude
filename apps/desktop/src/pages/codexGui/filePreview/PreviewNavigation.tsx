import { ArrowLeft, ArrowRight } from "lucide-react";
import { uiText } from "../../../i18n/uiText";
import styles from "./preview.module.less";

export interface PreviewNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  back: () => void;
  forward: () => void;
}

export function PreviewNavigation({ navigation }: { navigation: PreviewNavigationState }) {
  return <div className={styles.navigation} aria-busy={navigation.loading}>
    <button type="button" aria-label={uiText("client.conversation.goBack")} title={uiText("client.conversation.goBack")}
      disabled={!navigation.canGoBack} onClick={navigation.back}><ArrowLeft size={18} aria-hidden="true" /></button>
    <button type="button" aria-label={uiText("client.conversation.goForward")} title={uiText("client.conversation.goForward")}
      disabled={!navigation.canGoForward} onClick={navigation.forward}><ArrowRight size={18} aria-hidden="true" /></button>
  </div>;
}
