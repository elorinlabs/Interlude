import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ConfigProvider, Input, Modal, Switch } from 'antd';
import { Check, HardDrive, Play, Plus, RefreshCw, Search } from 'lucide-react';
import { hasLocalBackend, isDesktopApp, launchChatGpt } from '../api/backend';
import { useAccountManager } from '../hooks/useAccountManager';
import { useLanguage } from '../hooks/useLanguage';
import { AddAccountModal } from './AddAccountModal';
import { WindowControls } from '../components/WindowControls';
import { AccountList } from './AccountList';
import { BackupModal } from './BackupModal';
import { useAccountHealth } from './useAccountHealth';
import { useAccountRecovery } from './useAccountRecovery';
import { SavedLoginModal } from './SavedLoginModal';
import type {Account} from '../types';
import { useLocalAutomation } from './useLocalAutomation';
import { AutomationModal } from './AutomationModal';
import { RecoveryProgress } from './RecoveryProgress';
import { TokenHistoryModal } from './TokenHistoryModal';
import { AppearanceControls } from './AppearanceControls';
import { useAccountTheme } from './useAccountTheme';

export function AccountManagerApp() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme, colors } = useAccountTheme();
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((message: string) => {
    clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(''), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const manager = useAccountManager(notify, t);
  const recovery = useAccountRecovery(notify,t);
  const [recoveryAccount,setRecoveryAccount]=useState<Account|null>(null);
  const accountHealth = useAccountHealth(manager.accounts, notify, t,(id)=>{
    if(!manager.loginPending&&manager.busyAccountId===null)void recovery.enqueueSaved(id);
  });
  const automation = useLocalAutomation(notify, t);
  const [automationOpen,setAutomationOpen]=useState(false);
  const [tokensOpen,setTokensOpen]=useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState(false);
  const [switchStage, setSwitchStage] = useState<string | null>(null);
  const launchingRef = useRef(false);
  const filtered = manager.accounts.filter((account) =>
    `${account.email} ${account.note} ${account.plan}`.toLowerCase().includes(query.trim().toLowerCase()));

  const launch = async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setLaunching(true);
    try {
      const started = await launchChatGpt();
      notify(hasLocalBackend
        ? t(started ? 'toast.chatGptStarted' : 'toast.chatGptAlreadyRunning')
        : t('toast.previewStartChatGpt'));
    } catch (error) { notify(String(error)); }
    finally { launchingRef.current = false; setLaunching(false); }
  };

  const remove = (id: string) => Modal.confirm({
    title: t('table.deleteConfirmTitle'), content: t('table.deleteConfirmDescription'),
    okText: t('table.delete'), cancelText: t('table.cancel'),
    okButtonProps: { danger: true }, width: 400, centered: true,
    onOk: () => manager.deleteAccount(id),
  });

  return <ConfigProvider theme={{ token: {
    colorPrimary: colors.accent, borderRadius: 12, fontSize: 14, colorText: colors.ink,
    colorBgContainer: '#ffffffb8', colorBorder: '#ffffffb3', fontFamily: 'Inter, Segoe UI, Microsoft YaHei, sans-serif',
  }, components: { Modal: { contentBg: '#f7fbf3d9', headerBg: 'transparent' } } }}>
    <div className="accounts-app">
      <header className="accounts-header" data-tauri-drag-region>
        <div className="accounts-brand"><img className="brand-mark" src="/interlude-logo.svg" alt="" /><span>Interlude</span></div>
        <div className="accounts-header-actions">
          <Button type="text" icon={<HardDrive size={16} />} onClick={() => setCloudOpen(true)}>
            {t('accountsOnly.backup.title')}
          </Button>
          <Button className="launch-button" icon={<Play size={14} />} loading={launching} disabled={recovery.current!==null} onClick={() => void launch()}>
            {t('accountsOnly.launch')}
          </Button>
          {isDesktopApp && <WindowControls onError={notify} t={t} />}
        </div>
      </header>
      <main className="accounts-content">
        <div className="accounts-intro">
          <div><h1>{t('accountsOnly.title')}</h1><p>{t('accountsOnly.description')}</p></div>
          <Button type="primary" size="large" icon={<Plus size={17} />}
            disabled={recovery.current!==null||Boolean(manager.loginPending)} onClick={() => { setLoginOpen(true); }}>
            {t('accountsOnly.add')}
          </Button>
        </div>
        {manager.loginPending&&<div className="relay-status" role="status">{t('accountsOnly.login.waiting')}
          <Button type="text" onClick={()=>void manager.cancelLogin()}>{t('table.cancel')}</Button></div>}
        {recovery.current&&<RecoveryProgress email={manager.accounts.find(account=>account.id===recovery.current)?.email??''}
          count={recovery.count} stage={recovery.stage} elapsed={recovery.elapsed} verifying={recovery.verifying} t={t} onStop={recovery.stop}/>}
        {switchStage&&<section className="glass-operation switch-progress" role="status">
          <strong><RefreshCw size={15} className="operation-spinner"/>{t('accountsOnly.flow.switching')}</strong>
          <p>{manager.accounts.find(account=>account.id===switchStage)?.email}</p>
          <div className="switch-route">{['prepare','credentials','launch'].map(step=><span key={step}>{t(`accountsOnly.switchStage.${step}` as Parameters<typeof t>[0])}</span>)}</div>
        </section>}
        <p className="conversation-continuity" title={t('accountsOnly.continuityHint')}>
          <Check size={14} />{t('accountsOnly.continuity')}
        </p>
        <AppearanceControls language={language} onLanguage={setLanguage} theme={theme} onTheme={setTheme} t={t} />
        <div className="accounts-preferences">
          <Button type="text" onClick={()=>setTokensOpen(true)}>{t('accountsOnly.tokens.title')}</Button>
          <label><Switch size="small" checked={Boolean(automation.state?.config.widgetEnabled)}
            loading={automation.saving} disabled={!automation.state}
            aria-label={t('accountsOnly.widget.toggle')}
            onChange={enabled=>{if(automation.state)void automation.save({...automation.state.config,widgetEnabled:enabled,widgetProvider:'codex'});}}/>
            <span>{t('accountsOnly.widget.toggle')}</span></label>
          <span className="refresh-cadence">{t(automation.state?.refreshStatus==='refreshFailed'?'accountsOnly.widget.stale':'accountsOnly.widget.refreshHint')}</span>
          <Button type="text" onClick={()=>setAutomationOpen(true)} disabled={!automation.state}>{t('accountsOnly.automation.title')}</Button>
        </div>
        <section className="accounts-glass-panel" aria-label={t('accountsOnly.title')}>
        <div className="accounts-toolbar">
          <div className="accounts-count">
            <span>{t('accountsOnly.count', { count: manager.accounts.length })}</span>
            {!hasLocalBackend && <span className="preview-label">{t('accountsOnly.preview')}</span>}
          </div>
          <div className="accounts-tools">
            <Input prefix={<Search size={15} />} value={query} allowClear
              placeholder={t('accountsOnly.search')} aria-label={t('accountsOnly.search')}
              onChange={(event) => setQuery(event.target.value)} />
            <Button type="text" loading={accountHealth.progress!==null}
              disabled={Boolean(manager.loginPending)||recovery.current!==null||manager.busyAccountId!==null||accountHealth.checkingId!==null||!manager.accounts.length}
              onClick={()=>{recovery.beginBatch();void accountHealth.checkAll();}}>
              {accountHealth.progress?t('accountsOnly.health.checkProgress',accountHealth.progress):t('accountsOnly.health.checkAll')}
            </Button>
            <Button type="text" icon={<RefreshCw size={15} />} loading={manager.refreshingAll || manager.loading}
              onClick={() => void manager.refreshAll()}>{t('actions.refresh')}</Button>
          </div>
        </div>
        <AccountList accounts={filtered} loading={manager.loading} busyId={manager.busyAccountId??recovery.current??(manager.loginPending?'login':null)}
          searching={Boolean(query.trim())} t={t} onAdd={() => setLoginOpen(true)}
          onSwitch={(id) => { setSwitchStage(id); void Promise.resolve(manager.switchAccount(id)).finally(()=>setSwitchStage(null)); }} onDelete={remove}
          onRefresh={(id) => void manager.refreshUsage(id)}
          health={accountHealth.health} checkingId={accountHealth.checkingId}
          onConfigureRecovery={isDesktopApp?setRecoveryAccount:undefined}
          onCheck={(id) => {if(!recovery.current&&!manager.loginPending){recovery.beginBatch();void accountHealth.check(id);}}}
          onRepair={(id) => { if (!recovery.current && !manager.loginPending) { recovery.beginBatch(); recovery.enqueue(id); } }} />
        </section>
      </main>
      {tokensOpen&&<TokenHistoryModal accounts={manager.accounts} t={t} onClose={()=>setTokensOpen(false)}/>}
      {loginOpen && <AddAccountModal t={t} onClose={() => setLoginOpen(false)}
        onLogin={(privateMode) => { setLoginOpen(false); void manager.startLogin(false, privateMode); }}
        onImport={() => { setLoginOpen(false); void manager.importAccountJson(); }} />}
      {cloudOpen && <BackupModal t={t} onClose={() => setCloudOpen(false)}
        onSynced={manager.reload} />}
      {recoveryAccount&&<SavedLoginModal account={recoveryAccount} t={t} onClose={()=>setRecoveryAccount(null)}/>}
      {automationOpen&&automation.state&&<AutomationModal accounts={manager.accounts} state={automation.state}
        saving={automation.saving} t={t} onClose={()=>setAutomationOpen(false)} onSave={automation.save}/>}
      {notice && <div className="account-notice" role="status"><Check size={17} />{notice}</div>}
    </div>
  </ConfigProvider>;
}
