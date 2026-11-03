import { useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { ImageViewerFrame } from '../chat/ImageViewerFrame';
import { displayText as t } from '../localization/messages';
import { saveLoungeImage } from './saveImage';

export function LoungePreview({ uri, close }: { uri: string; close: () => void }) {
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setFailed(false);
    try { await saveLoungeImage(uri); }
    catch { setFailed(true); }
    finally { busy.current = false; setSaving(false); }
  };
  const label = t(saving ? 'client.projectBrowser.saving' : 'client.shared.downloadImage');
  return <ImageViewerFrame src={uri} description={t('client.lounge.previewImage')}
    close={close} translate={t} naturalSize>
    <button type="button" className="cs-image-download" disabled={saving} aria-busy={saving}
      aria-label={label} onClick={() => void save()}>
      {saving ? <LoaderCircle size={24} className="cs-image-download-spinner" aria-hidden="true" />
        : <Download size={24} aria-hidden="true" />}<span>{label}</span>
    </button>
    {failed && <div className="cs-image-status" role="status">
      {t('client.workspaceActions.couldNotSaveTheImagePleaseTryAgain')}</div>}
  </ImageViewerFrame>;
}
