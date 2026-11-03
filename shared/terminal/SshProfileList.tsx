import { useState } from 'react';
import { Input, Spin } from 'antd';
import { Check, Plus, Search, Server } from 'lucide-react';
import { sshLabel, type SshProfile } from './sshProfiles';
import { displayText as t } from '../localization/messages';

interface Props {
  profiles: SshProfile[]; selected?: SshProfile; disabled: boolean; loading: boolean;
  choose: (profile?: SshProfile) => void;
}

export function SshProfileList({ profiles, selected, disabled, loading, choose }: Props) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const filtered = profiles.filter(profile =>
    `${profile.name} ${sshLabel(profile)}`.toLocaleLowerCase().includes(search));
  return <aside className="ssh-profile-sidebar" aria-label={t('client.ssh.savedConnections')}>
    <div className="ssh-profile-heading"><span>{t('client.ssh.savedConnections')}</span>
      <span className="ssh-profile-count">{profiles.length}</span></div>
    <Input className="ssh-profile-search" prefix={<Search size={15} aria-hidden />} allowClear
      value={query} onChange={event => setQuery(event.target.value)}
      placeholder={t('client.ssh.searchConnections')} aria-label={t('client.ssh.searchConnections')} />
    <button type="button" className="ssh-profile-new" aria-pressed={!selected} disabled={disabled}
      onClick={() => choose()}><Plus size={16} aria-hidden />{t('client.ssh.createTitle')}</button>
    <div className="ssh-profile-results" aria-busy={loading}>
      {loading ? <div className="ssh-profile-empty"><Spin /></div> : <>
        {filtered.length ? <ul className="ssh-profile-list">{filtered.map(profile => <li key={profile.id}>
          <button type="button" className="ssh-profile-card" aria-pressed={selected?.id === profile.id}
            disabled={disabled} onClick={() => choose(profile)}>
            <span className="ssh-profile-icon"><Server size={17} aria-hidden /></span>
            <span className="ssh-profile-copy"><strong>{profile.name || profile.host}</strong>
              <small>{sshLabel(profile)}</small></span>
            {selected?.id === profile.id && <Check size={14} className="ssh-profile-check" aria-hidden />}
          </button>
        </li>)}</ul> : <div className="ssh-profile-empty"><Server size={26} strokeWidth={1.5} aria-hidden />
          <strong>{t(search ? 'client.ssh.noMatchingConnections' : 'client.ssh.noSavedConnections')}</strong>
          <p>{t(search ? 'client.ssh.searchHint' : 'client.ssh.emptyConnectionsHint')}</p>
        </div>}
      </>}
    </div>
  </aside>;
}
