import { uiText } from "../../i18n/uiText";
import { CircleAlert, X } from "lucide-react";
import type { ReactNode } from 'react';
import type { CapacityRetryState } from "./capacityRetry";
import styles from "./RequestErrorNotice.module.less";

export interface CapacityRetryControl {
  retry?: CapacityRetryState;
  onCancelRetry?: () => void;
}

export function CapacityErrorNotice({ retry, onCancelRetry, action }: CapacityRetryControl & { action?: ReactNode }) {
  return <div className={styles.capacityNotice}>
    <div className={styles.capacityContent}>
      <CircleAlert size={20} aria-hidden="true" />
      <span className={styles.capacityMessage}>{uiText('client.chat.modelAtCapacity')}</span>
    </div>
    {action && <div className={styles.capacityAction}>{action}</div>}
    {retry && <div className={styles.countdown}>
      <span role="status">{retry.seconds > 0 ? uiText("client.composer.retryingAutomaticallyInSeconds", { value1: retry.seconds }) : uiText("client.composer.waitingToRetry")}</span>
      <button type="button" aria-label={uiText("client.composer.stopAutomaticRetries")} onClick={onCancelRetry}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>}
  </div>;
}
