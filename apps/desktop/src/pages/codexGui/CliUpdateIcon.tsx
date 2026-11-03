import { uiText } from "../../i18n/uiText";
import { Badge } from "antd";
import { Info } from "lucide-react";

export function CliUpdateIcon({ version, release }: {
  version: string | null; release: { version: string } | null;
}) {
  const available = Boolean(version && release && release.version !== version);
  return <Badge dot={available} offset={[1, 0]} styles={{ root: { display: "inline-flex" } }}
    title={available ? uiText("client.composer.updateAvailable") : undefined}>
    <Info size={16} />
  </Badge>;
}
