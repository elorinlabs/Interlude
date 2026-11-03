import { uiText } from "../../../i18n/uiText";
import type { GuiAccountChoice } from '../../../../../../shared/remote-chat/guiAccounts';
import { GuiAccountSummary, GuiPrimaryQuota } from '../GuiAccountSummary';

export function RemoteAccountSummary({ name, current, ready, running }: {
  name: string; current?: GuiAccountChoice; ready: boolean; running?: boolean;
}) {
  const plan = current?.kind === 'account' ? current.plan : undefined;
  let detail = <small>{uiText("client.workspaceActions.chooseAnAccountOnThisComputer")}</small>;
  if (!ready) detail = <small>{uiText("client.workspaceActions.waitingToConnectToTheComputer")}</small>;
  else if (running === false) detail = <small>{uiText("client.workspaceActions.proxyNotStarted")}</small>;
  else if (current?.kind === 'account' && current.primaryRemainingPercent !== undefined) {
    detail = <GuiPrimaryQuota remainingPercent={current.primaryRemainingPercent} />;
  } else if (current?.detail) {
    // Older computers send only the description; keep it readable until they are updated.
    detail = <small>{current.detail}</small>;
  }
  return <GuiAccountSummary name={name} plan={plan} detail={detail} />;
}
