import { useEffect, useState } from 'react';
import { Button, Modal, Tabs, Tooltip } from 'antd';
import { Settings2 } from 'lucide-react';
import { uiText } from '../../i18n/uiText';
import { GuiAppearanceSettings } from './GuiAppearanceSettings';
import { GuiMessageSettings } from './GuiMessageSettings';

export function GuiChatSettingsButton({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const title = uiText('client.workspaceSettings.codexGuiSettings');
  return <>
    <Tooltip title={title} styles={{ root: { maxWidth: 400 } }}>
      <Button type="text" icon={<Settings2 size={16} />} aria-label={title} onClick={() => setOpen(true)} />
    </Tooltip>
    <Modal open={open && active} title={title} onCancel={() => setOpen(false)} footer={null} width={600}>
      <Tabs items={[
        { key: 'messages', label: uiText('client.messageQueue.settings'), children: <GuiMessageSettings /> },
        { key: 'appearance', label: uiText('client.workspaceSettings.appearance.785d65'),
          children: <GuiAppearanceSettings /> },
      ]} />
    </Modal>
  </>;
}
