import { t, useLanguage } from '../i18n';
import { Button } from "antd-mobile";
import { Download } from "lucide-react";
import { AdaptiveSheet } from "./AdaptiveSheet";

const DESKTOP_DOWNLOAD_URL = "https://github.com/piperhex/remoteai/releases/latest";

interface RegistrationSheetProps {
  open: boolean;
  onClose: () => void;
}

export function RegistrationSheet({ open, onClose }: RegistrationSheetProps) {
  useLanguage();
  return <AdaptiveSheet open={open} title={t("client.app.signUpInTheDesktopApp")} onClose={onClose} width={440}>
    <div className="registration-guide">
      <p>{t("client.app.downloadTheLatestInterludeDesktopAppToCreateYour")}</p>
      <p>{t("client.app.thenUseTheSameAccountToSignInOnThe")}</p>
      <div className="sheet-actions">
        <a className="registration-download" href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
          <Download size={18} aria-hidden="true" />{t("client.app.downloadDesktopApp")}</a>
        <Button block onClick={onClose}>{t("client.app.backToSignIn")}</Button>
      </div>
    </div>
  </AdaptiveSheet>;
}
