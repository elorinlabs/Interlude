# Local cloud-folder synchronization

> Complete-backup update: the primary **备份与恢复** screen now defaults to
> a single password-encrypted offline file. See [offline backup](offline-backup.md).
> Directory snapshots now include saved passwords, authenticator secrets and
> system-vault saved-login settings; older exclusion statements are superseded.

Interlude's active desktop application no longer uses the former account-sync
server. Its login form and IPC commands were removed. On startup the former
server URL, identity and local cloud-auth session file are retired; new settings
have no default server URL. Existing account data and files in a previously
chosen backup folder are not deleted.
If legacy session cleanup fails, the error is logged without preventing launch;
the former server UI and IPC commands remain unavailable.

## Configure on the first computer

1. Install and sign into your preferred cloud-drive client.
2. Configure that client's folder synchronization or backup task. Interlude does
   not sign into the cloud service or configure the client's upload rules.
3. In **网盘同步**, choose the client and its actual local sync/backup folder.
   Interlude uses a dedicated `Interlude/snapshots` subdirectory. If you choose
   the `Interlude` directory itself, it is reused.
4. Generate the recovery key, copy it to a separate safe location, acknowledge
   that it is saved and save the settings. Do not keep the key next to the backup.
5. Check the cloud client's upload status. A successful local write does not
   prove the cloud client uploaded the file.

Choices include Nutstore, Baidu Netdisk, Aliyun Drive, Quark Drive, Tencent Weiyun,
123 Cloud Drive, OneDrive and other/local/NAS folders. These are setup presets,
not proprietary cloud API integrations. Cloud-client plans, versions and sync
features vary. A normal download directory does not automatically upload files.
For a one-way backup service, download backups manually before recovery.

Nutstore officially documents folder synchronization at
https://help.jianguoyun.com/?p=24. Other presets use a capability-neutral guide;
Interlude does not claim every client supports bidirectional synchronization.

## Change or reinstall computers

1. Download the original `Interlude` folder to the new computer. Ensure the files
   are available locally, rather than only online placeholders.
2. Select that folder and enter the **original** 64-character recovery key.
3. Choose a dated backup version and use **合并恢复**.

The merge validates account identities, keeps newer local metadata and avoids
overwriting demonstrably newer local credentials. It does not change the active
account, write the live Codex auth file, restore providers, or restart Codex.
Accounts deleted on one device are not deleted on another. This is deliberate
snapshot backup and recovery, not automatic bidirectional account reconciliation.

Before recovery Interlude snapshots existing local accounts. Empty installations
do not generate empty replacement backups. A legacy `.cs` archive can be selected
through **导入旧版 .cs 备份** after configuring the new folder and key; it follows
the same account-only recovery path. Old backups are not silently rewritten.

## Encryption, versions and background work

- AES-256-GCM with a fresh nonce for each snapshot; the random recovery key is
  stored in the OS credential store, not the cloud folder or app configuration.
- Complete snapshots include account tokens, notes, groups, private account
  details, saved passwords, TOTP secrets and saved-login vault entries. Provider
  keys, usage caches and conversations are excluded. This updates the initial
  directory-backup version's narrower account-token-only scope.
- Automatic backup checks every 120 seconds, serializes file operations, takes
  the account-switch lock and writes only if meaningful account data changed.
- The first backup runs when automatic backup is enabled. Manual checks remain
  available when automatic backup is disabled. Fully exiting Interlude stops the
  worker; closing the main window retains the process while auto backup is on.
- Each device writes independent encrypted snapshot files and retains its own
  five most recent versions. It never prunes another device's files. Up to 100
  locally available versions are listed for recovery.
- Writes use a temporary encrypted file and rename after flushing. Errors are
  displayed in the dialog; polling is single-flight.
- Disconnecting stops automation and detaches the directory without deleting
  backup files. Losing the recovery key makes the encrypted files unrecoverable.

Settings: app-data `folder-sync.json`. Keyring service:
`dev.interlude.folder-sync`, entry `recovery-key`. Recovery envelopes start with
`INTERLUDE-FOLDER-1` and have the `.interlude` extension.

## Validation and limits

Run the production encryption/filesystem module tests independently:

```
cargo test --manifest-path apps/desktop/src-tauri/tests/folder-sync/Cargo.toml
```

Frontend tests cover setup, key acknowledgement, error recovery, preview
capability boundaries and absence of the former server hook. Native tests cover
AES round trips, wrong keys, tampering, bounded input, filename validation,
snapshot I/O and preserving other devices' backups.
The key/configuration commit is also tested: a failed settings write restores
the original key, and a keyring failure prevents the settings commit.

Validation results: 443 desktop test files / 2,994 tests passed; the standalone
native harness passed eight tests. Desktop and Web production builds, native
check, native Clippy and centralized i18n checks passed. Existing Rust warnings
and bundle size warnings remain.

No real cloud account is contacted by these checks. Actual cloud-client transfer,
Windows Credential Manager behavior in the packaged build and migration between
two physical computers require interactive verification. The native app remains
local-only; browser preview disables filesystem controls. The retained Web app
is a separate server-based product and does not gain local disk access.
