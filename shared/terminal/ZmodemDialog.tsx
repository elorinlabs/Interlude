import { useRef } from 'react';
import { Button, Modal, Progress } from 'antd';
import type { useZmodemTransfer } from './useZmodemTransfer';
import { zmodemMessage } from './zmodemMessage';

export function ZmodemDialog({ transfer, visible, translate }: {
  transfer: ReturnType<typeof useZmodemTransfer>; visible: boolean; translate: (key: string) => string;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const { state, downloads } = transfer;
  if (!state) return null;
  const busy = state.phase === 'offer' || state.phase === 'transfer';
  const sending = state.direction === 'send';
  const close = busy ? transfer.cancel : transfer.dismiss;
  return <Modal open={visible} width={400} title={translate(sending ? 'client.ssh.upload' : 'client.ssh.download')}
    onCancel={close} maskClosable={false} footer={null} destroyOnClose>
    <p role="status">{translate(zmodemMessage(state))}</p>
    {state.name && <p style={{ overflowWrap: 'anywhere' }}>{state.name}</p>}
    {state.phase === 'transfer' && <Progress percent={state.size
      ? Math.min(100, Math.floor(state.transferred / state.size * 100)) : 0} />}
    {downloads.map(file => <p key={file.url} style={{ overflowWrap: 'anywhere' }}>
      <a href={file.url} download={file.name}>{translate('client.ssh.download')}: {file.name}</a>
    </p>)}
    <input ref={picker} type="file" multiple hidden aria-label={translate('client.ssh.zmodemChooseFiles')}
      onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = '';
        if (files.length) void transfer.accept(files);
      }} />
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button onClick={close}>{translate(busy ? 'client.ssh.cancel' : 'client.ssh.zmodemClose')}</Button>
      {state.phase === 'offer' && <Button type="primary" onClick={() => {
        if (sending) { void transfer.prepareUpload(); picker.current?.click(); }
        else void transfer.accept();
      }}>{translate(sending ? 'client.ssh.zmodemSelect' : 'client.ssh.zmodemReceive')}</Button>}
    </div>
  </Modal>;
}
