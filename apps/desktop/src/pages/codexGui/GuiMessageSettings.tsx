import { useId, useState } from 'react';
import { Switch } from 'antd';
import { uiText } from '../../i18n/uiText';
import { saveMessageQueueEnabled } from '../../../../../shared/chat/messageQueueSettings';
import { useMessageQueueEnabled } from '../../../../../shared/chat/useMessageQueueEnabled';
import styles from './GuiMessageSettings.module.less';

export function GuiMessageSettings() {
  const enabled = useMessageQueueEnabled();
  const id = useId();
  const [error, setError] = useState(false);
  return <section className={styles.panel} aria-label={uiText('client.messageQueue.settings')}>
    <div className={styles.card}>
      <div className={styles.row}>
        <label htmlFor={id}>{uiText('client.messageQueue.enabled')}</label>
        <Switch id={id} checked={enabled} aria-describedby={`${id}-description`}
          onChange={value => setError(!saveMessageQueueEnabled(value))} />
      </div>
      <p id={`${id}-description`}>{uiText('client.messageQueue.description')}</p>
      <p>{uiText('client.messageQueue.hint')}</p>
    </div>
    {error && <p role="alert" className={styles.error}>{uiText('client.messageQueue.saveError')}</p>}
  </section>;
}
