import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n';
import './modelRefreshButton.css';

export function ModelRefreshButton({ ready, refreshModels, compact = false }: {
  ready: boolean; refreshModels: () => Promise<void>; compact?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (!ready || refreshing) return;
    setRefreshing(true);
    try { await refreshModels(); } finally { setRefreshing(false); }
  };
  const label = t(refreshing ? "client.mobile.refreshingModels" : "client.mobile.refreshModels");
  return <Tooltip title={label} styles={{ root: { maxWidth: 400 } }}>
    {compact ? <Button type="text" size="small" className="model-refresh-button-compact"
      icon={<RefreshCw size={14} aria-hidden="true" />} loading={refreshing} disabled={!ready || refreshing}
      aria-label={label} aria-busy={refreshing} onClick={() => { void refresh(); }} />
      : <button type="button" className="model-refresh-button" disabled={!ready || refreshing}
      aria-label={label} aria-busy={refreshing} onClick={() => { void refresh(); }}>
      <RefreshCw size={18} aria-hidden="true" />
    </button>}
  </Tooltip>;
}
