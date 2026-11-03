import { Input, Spin, type InputRef } from 'antd';
import { RefreshCw, Search } from 'lucide-react';
import type { Ref } from 'react';
import styles from './ComputerSearchBar.module.less';

export interface ComputerListRefresh {
  loading: boolean;
  error: string;
  refresh: () => void;
}

export function ComputerSearchBar({ query, onQueryChange, inputRef, searchLabel, refreshLabel, refresh }: {
  query: string;
  onQueryChange: (value: string) => void;
  inputRef?: Ref<InputRef>;
  searchLabel: string;
  refreshLabel: string;
  refresh?: ComputerListRefresh;
}) {
  return <div className={styles.bar}>
    <Input ref={inputRef} variant="borderless" className={styles.search} prefix={<Search size={16} />}
      aria-label={searchLabel} placeholder={searchLabel} value={query}
      onChange={event => onQueryChange(event.target.value)} />
    {refresh && <button type="button" className={styles.refresh} disabled={refresh.loading}
      aria-label={refreshLabel} aria-busy={refresh.loading} title={refreshLabel} onClick={refresh.refresh}>
      {refresh.loading ? <Spin size="small" /> : <RefreshCw size={16} aria-hidden="true" />}
    </button>}
  </div>;
}
