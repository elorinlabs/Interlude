import { t } from '../i18n';
import { Toast } from 'antd-mobile';

export async function copyText(label: string, value: string, { successToast = true } = {}): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    if (successToast) Toast.show({ icon: 'success', content: t("client.app.copied", { value1: label }) });
    return true;
  } catch {
    Toast.show({ icon: 'fail', content: t("client.app.couldNotCopyPleaseTryAgain") });
    return false;
  }
}
