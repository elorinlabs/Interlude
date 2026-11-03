import { t, useLanguage } from '../i18n';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Form, Input, Toast } from 'antd-mobile';
import { QrCode } from 'lucide-react';
import { normalizeTotpSecret, parseOtpAuthUri } from '../totp';
import type { TotpEntry } from '../types';
import { AdaptiveSheet } from '../components/AdaptiveSheet';

type Draft = Omit<TotpEntry, 'id' | 'createdAt' | 'updatedAt'>;
const EMPTY_DRAFT: Draft = { issuer: '', accountName: '', secret: '', algorithm: 'SHA1', digits: 6, period: 30 };

async function scanQrFile(file: File) {
  const detectorType = (window as unknown as {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect(source: ImageBitmap): Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!detectorType) throw new Error(t("client.settings.thisBrowserCannotScanQrCodesPasteTheKeyManually"));
  const bitmap = await createImageBitmap(file);
  try {
    const values = await new detectorType({ formats: ['qr_code'] }).detect(bitmap);
    const value = values[0]?.rawValue;
    if (!value) throw new Error(t("client.settings.noValidQrCodeFound"));
    return parseOtpAuthUri(value);
  } finally { bitmap.close(); }
}

export function TotpForm({ entry, scanFirst, onSave, onClose }: {
  entry: TotpEntry | null; scanFirst: boolean; onSave: (draft: Draft, id?: string) => void; onClose: () => void;
}) {
  useLanguage();
  const [draft, setDraft] = useState<Draft>(entry ?? EMPTY_DRAFT);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = () => {
    try {
      const parsed = draft.secret.trim().toLowerCase().startsWith('otpauth://')
        ? parseOtpAuthUri(draft.secret) : { ...draft, issuer: draft.issuer.trim(),
          accountName: draft.accountName.trim(), secret: normalizeTotpSecret(draft.secret) };
      if (!parsed.issuer) throw new Error(t("client.settings.enterAServiceName"));
      onSave(parsed, entry?.id);
      Toast.show({ icon: 'success', content: t("client.settings.2faKeySaved") });
      onClose();
    } catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.settings.invalid2faKey") });
    }
  };
  const importQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanning(true);
    try { setDraft(await scanQrFile(file)); }
    catch (error) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.settings.couldNotReadTheQrCode") });
    } finally { setScanning(false); }
  };
  return <AdaptiveSheet open title={entry ? t("client.settings.edit2faKey") : t("client.settings.add2faKey")}
    subtitle={t("client.settings.enterAServiceNameAndKeyOrChooseAQr")} onClose={onClose}>
    {scanFirst && <p className="settings-hint">{t("client.settings.chooseAQrCodeFromYourPhotosOrTakeA")}</p>}
    <Button block loading={scanning} onClick={() => fileRef.current?.click()}><QrCode size={18} />{t("client.settings.chooseQrCodeImage")}</Button>
    <input ref={fileRef} hidden type="file" accept="image/*" onChange={event => void importQr(event)} />
    <Form layout="vertical" footer={<Button block color="primary" disabled={scanning} onClick={save}>{t("client.settings.saveKey")}</Button>}>
      <Form.Item label={t("client.settings.serviceName")}><Input aria-label={t("client.settings.serviceName")} value={draft.issuer} placeholder={t("client.settings.forExampleOpenai")}
        onChange={value => setDraft(current => ({ ...current, issuer: value }))} /></Form.Item>
      <Form.Item label={t("client.settings.accountName")}><Input aria-label={t("client.settings.accountName")} value={draft.accountName} placeholder="name@example.com"
        onChange={value => setDraft(current => ({ ...current, accountName: value }))} /></Form.Item>
      <Form.Item label={t("client.app.2faKeys")}><Input aria-label={t("client.app.2faKeys")} value={draft.secret} autoComplete="off"
        placeholder={t("client.settings.pasteAKeyOrVerificationLink")} onChange={value => setDraft(current => ({ ...current, secret: value }))} />
      </Form.Item>
    </Form>
  </AdaptiveSheet>;
}
