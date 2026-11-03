import type { BrowserSettings } from '../project-browser/nativeBridge';
import type { ProjectTreeOptions } from '../project-browser/ProjectTree';
import { SshProjectToolbar } from './SshProjectToolbar';
import { SshHiddenFilesMenuItem } from './SshHiddenFilesMenuItem';
import type { NativeSshBrowserAction } from './nativeSshBrowserAction';
import './sshProjectBrowser.css';

export function nativeSshTreeOptions(settings: BrowserSettings, send: (action: NativeSshBrowserAction) => void)
  : ProjectTreeOptions | undefined {
  const ssh = settings.ssh;
  if (!ssh) return undefined;
  return {
    root: ssh.path, showHidden: ssh.hidden, revision: ssh.revision,
    renderRootMenuExtras: close => <SshHiddenFilesMenuItem hidden={ssh.hidden}
      disabled={ssh.busy || !settings.connected}
      toggle={() => { send({ type: 'ssh', action: 'hidden', value: !ssh.hidden }); close(); }} />,
    renderToolbar: ({ refresh, menu }) => <SshProjectToolbar path={ssh.path}
      disabled={ssh.busy || !settings.connected}
      navigate={path => send({ type: 'ssh', action: 'navigate', path })}
      pickUpload={() => send({ type: 'ssh', action: 'upload' })} actions={<>{refresh}{menu}</>} />,
  };
}
