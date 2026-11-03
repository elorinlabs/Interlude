import { uiText } from "../../i18n/uiText";
import { remoteErrorText } from "../../../../../shared/localization/errors";
import { useRef, useState } from "react";
import { Input, Modal, Popover, type InputRef } from "antd";
import { Check, GitBranch, GitFork, Laptop, Plus, Search } from "lucide-react";
import { isDesktopApp } from "../../api/backend";
import { useGitWorkspace } from "./useGitWorkspace";
import type { GitWorkspaceClient } from "./gitApi";
import styles from "./WorkspacePicker.module.less";

const MAX_BRANCH_LENGTH = 200;
const MENU_ALIGN = { overflow: { adjustX: true, adjustY: true, shiftX: true } };

export function WorkspacePicker({ cwd, disabled, onChange, onBusyChange, request, enabled = true, remote = false,
  localLabel = isDesktopApp ? uiText("client.git.local") : uiText("client.conversation.interludeHost") }: {
  cwd: string; disabled: boolean; onChange: (cwd: string) => void; onBusyChange: (busy: boolean) => void;
  localLabel?: string; request?: GitWorkspaceClient; enabled?: boolean; remote?: boolean;
}) {
  const git = useGitWorkspace({ cwd, onChange, onBusyChange, request, enabled });
  const [menu, setMenu] = useState<"branch" | "location" | null>(null);
  const [dialog, setDialog] = useState<"branch" | "worktree" | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const search = useRef<InputRef>(null);
  const locked = disabled || git.busy || git.loading;
  const worktreeLabel = remote ? uiText("client.workspaceActions.remoteWorktree") : uiText("client.workspaceActions.localWorktree");
  const createWorktreeLabel = remote ? uiText("client.workspaceActions.newRemoteWorktree") : uiText("client.workspaceActions.newLocalWorktree");
  const locationLabel = git.status?.isWorktree ? worktreeLabel : localLabel;
  const computerLabel = remote ? uiText("client.workspaceActions.remoteComputer") : uiText("client.git.local");
  const branchLabel = git.status?.branch ?? (git.status ? uiText("client.git.detachedHead") : uiText("client.workspaceActions.gitBranch"));
  const branches = git.status?.branches.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())) ?? [];
  const openDialog = (kind: "branch" | "worktree") => { setMenu(null); setBranch(""); setDialog(kind); };
  const create = async () => {
    if (locked || !branch.trim()) return;
    const operation = dialog === "worktree" ? "createWorktree" : "switch";
    if (await git.run({ operation, cwd, branch: branch.trim(), create: true })) setDialog(null);
  };
  const toggle = (kind: "branch" | "location", open: boolean) => {
    setMenu(open ? kind : null);
    if (open) { setQuery(""); void git.refresh(); }
  };
  const notice = git.error && <p role="alert" className={styles.notice}>{remoteErrorText(git.error)}</p>;
  const branchPanel = <div className={styles.panel} onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); setMenu(null); }
  }}>
    <Input ref={search} prefix={<Search size={16} />} variant="borderless" aria-label={uiText("client.git.searchBranches")} placeholder={uiText("client.git.searchBranches")}
      value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className={styles.caption}>{git.loading ? uiText("client.workspaceActions.loadingBranches") : uiText("client.workspaceActions.branch")}</div>
    <div className={styles.list} role="menu" aria-label={uiText("client.workspaceActions.gitBranch")}>
      {branches.map((item) => <button type="button" role="menuitemradio" key={item.name}
        aria-checked={item.name === git.status?.branch} disabled={locked || item.occupied}
        className={styles.option} onClick={async () => {
          if (locked) return;
          if (await git.run({ operation: "switch", cwd, branch: item.name, create: false })) setMenu(null);
        }}>
        <GitBranch size={17} /><span>{item.name}
          {item.name === git.status?.branch && <small>{uiText("client.workspaceActions.uncommitted")}{git.status.changedFiles}  {uiText("client.chat.files.2d4a2a")}</small>}
          {item.occupied && <small>{uiText("client.workspaceActions.alreadyOpenInAnotherWorktree")}</small>}
        </span>{item.name === git.status?.branch && <Check size={17} />}
      </button>)}
      {!branches.length && <p className={styles.caption}>{query ? uiText("client.workspaceActions.noMatchingBranches") : uiText("client.workspaceActions.noBranchesYet")}</p>}
    </div>
    {notice}
    <button type="button" className={`${styles.option} ${styles.create}`} disabled={locked || !git.status}
      onClick={() => openDialog("branch")}><Plus size={18} />{uiText("client.workspaceActions.createAndSwitchToANewBranch")}</button>
  </div>;
  const locationPanel = <div className={styles.panel} onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); setMenu(null); }
  }}>
    <div className={styles.caption}>{uiText("client.workspaceActions.workLocation")}</div>
    <div className={styles.option}><Laptop size={18} />
      <span>{git.status?.isWorktree ? worktreeLabel : computerLabel}</span>
      <Check size={17} /></div>
    <button type="button" className={styles.option} disabled={locked || !git.status}
      onClick={() => openDialog("worktree")}><GitFork size={18} /><span>{createWorktreeLabel}</span></button>
    <p className={styles.caption}>{uiText("client.workspaceActions.createASeparateCopyFromTheCurrentCommitForParallel")}</p>{notice}
  </div>;
  return <>
    <Popover trigger="click" placement="topLeft" align={MENU_ALIGN} arrow={false}
      open={menu === "location" && !disabled}
      onOpenChange={(open) => toggle("location", open)} content={locationPanel}
      styles={{ root: { maxWidth: 400 }, body: { padding: 6, borderRadius: 18 } }}>
      <button type="button" className={styles.trigger} disabled={disabled || git.busy}
        aria-label={uiText("client.workspaceActions.workLocation")} aria-haspopup="menu" aria-expanded={menu === "location"}>
        <Laptop size={16} /><span>{locationLabel}</span>
      </button>
    </Popover>
    {cwd && <Popover trigger="click" placement="topLeft" align={MENU_ALIGN} arrow={false}
      open={menu === "branch" && !disabled}
      onOpenChange={(open) => toggle("branch", open)} content={branchPanel}
      afterOpenChange={(open) => { if (open) search.current?.focus(); }}
      styles={{ root: { maxWidth: 400 }, body: { padding: 6, borderRadius: 18 } }}>
      <button type="button" className={styles.trigger} disabled={disabled || git.busy}
        aria-label={uiText("client.workspaceActions.switchGitBranch")} aria-haspopup="menu" aria-expanded={menu === "branch"}>
        <GitBranch size={16} /><span>{branchLabel}</span>
      </button>
    </Popover>}
    {dialog && <Modal open centered width={400} title={dialog === "worktree" ? createWorktreeLabel : uiText("client.workspaceActions.createBranch")}
      okText={dialog === "worktree" ? uiText("client.workspaceActions.createWorktree") : uiText("client.workspaceActions.createAndSwitch")} cancelText={uiText("client.accounts.cancel")}
      confirmLoading={git.busy} okButtonProps={{ disabled: locked || !branch.trim() }}
      cancelButtonProps={{ disabled: git.busy }} closable={!git.busy} maskClosable={!git.busy} keyboard={!git.busy}
      onCancel={() => setDialog(null)} onOk={() => void create()}>
      <p>{dialog === "worktree" ? uiText("client.workspaceActions.newConversationsWillUseASeparateWorktreeUncommittedChangesStay")
        : uiText("client.workspaceActions.createABranchFromTheCurrentCommitAndUseIt")}</p>
      <Input autoFocus aria-label={uiText("client.workspaceActions.newBranchName")} placeholder={uiText("client.workspaceActions.newBranchNameSuchAsFeatureLogin")} value={branch}
        maxLength={MAX_BRANCH_LENGTH} disabled={git.busy} onChange={(event) => setBranch(event.target.value)}
        onPressEnter={() => void create()} />{notice}
    </Modal>}
  </>;
}
