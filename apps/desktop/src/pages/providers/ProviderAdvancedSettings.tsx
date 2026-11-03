import { Checkbox, Input } from "antd";
import { useId } from "react";
import type { Translate } from "../../i18n";
import type { useProviderRequestOptions } from "./useProviderRequestOptions";

interface Props {
  options: ReturnType<typeof useProviderRequestOptions>;
  saving: boolean;
  allowFullUrl?: boolean;
  t: Translate;
}

export function ProviderAdvancedSettings({ options, saving, allowFullUrl = true, t }: Props) {
  const fieldId = useId();
  const headersId = `${fieldId}-headers`;
  const bodyId = `${fieldId}-body`;
  return <details style={{ marginTop: 16 }}>
    <summary>{t("providers.advanced.title")}</summary>
    <div className="provider-form" style={{ marginTop: 12 }}>
      {allowFullUrl && <Checkbox checked={options.useFullUrl} disabled={saving}
        onChange={(event) => options.setUseFullUrl(event.target.checked)}>
        {t("providers.advanced.fullUrl")}
      </Checkbox>}
      {allowFullUrl && <small>{t("providers.advanced.fullUrlHint")}</small>}
      <label htmlFor={headersId}>{t("providers.advanced.headers")}</label>
      <Input.TextArea id={headersId} value={options.headers} disabled={saving}
        rows={3} placeholder={'{"X-Region": "east"}'} spellCheck={false}
        onChange={(event) => options.setHeaders(event.target.value)} />
      <label htmlFor={bodyId}>{t("providers.advanced.body")}</label>
      <Input.TextArea id={bodyId} value={options.body} disabled={saving}
        rows={3} placeholder={'{"temperature": 0.7}'} spellCheck={false}
        onChange={(event) => options.setBody(event.target.value)} />
      <small>{t("providers.advanced.hint")}</small>
      {options.error && <small role="alert" className="form-error">
        {t(`providers.advanced.${options.error}`)}
      </small>}
    </div>
  </details>;
}
