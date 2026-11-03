# Offline complete backup

## Recommended workflow

Open **备份与恢复 → 离线完整备份**, choose **创建备份**, enter and confirm a
backup passphrase of at least 12 characters, then select a file destination.
The output is a single `.interlude-backup` file. No server login, cloud client
or separately copied 64-character recovery key is needed.

For reinstalling or moving computers, keep that file on a USB drive, external
disk or another disk that will not be erased. On the new computer open the same
screen, choose **恢复备份**, enter the original passphrase and select the file.
Confirm the merge. Files existing only on an erased disk cannot be recovered.

The backup passphrase is separate from account passwords and is not persisted
by Interlude. Keep it separately from the file. There is no password-reset
service for encrypted backups.

## Included data

- Account authentication tokens, notes, groups and related account metadata.
- Account-record private details, including saved passwords and authenticator
  secrets when present.
- Saved-login entries from the system credential store, including login email,
  password and complete TOTP URI (algorithm, digits and period).
- Auto-login availability, restored by writing the validated saved-login entry
  into the new computer's system credential store.

The application cannot reconstruct information that was never saved. A temporary
six-digit authenticator code is not a replacement for its original secret.
Conversations, external application files and unrelated provider configuration
are not included. Restoring does not start login, switch the active account,
restart Codex or change the live Codex `auth.json`.

## Recovery behavior

Accounts merge through the existing identity validator and stale-token guard.
All incoming accounts, private details and saved-login identities are validated
before vault changes. Existing newer saved logins are preserved; missing local
entries can be restored. Older backup versions without saved-login data do not
delete current saved logins.

Before importing into a non-empty local store, Interlude creates a complete
password-encrypted safety copy under the application-data directory's
`backup-before-restore/` folder. It uses the passphrase entered for this restore.
Its path is displayed on success. If an import fails, retain these files for
recovery; account-file writes may have partially completed after an I/O error.
Vault changes are rolled back after a failed vault or account apply operation,
and rollback failures have a separate error message. Errors are never presented
as successful recovery.

## Optional directory backups

The existing **网盘同步** tab remains optional. Its encrypted local-folder
snapshots now include the same complete account and saved-login information.
Selecting an ordinary local folder also works without any cloud storage, while
choosing a cloud-client folder still delegates file transfer to that client.
Directory snapshots keep their existing OS-stored recovery key; portable files
instead use the passphrase chosen for that file.

New complete snapshots use account-payload version 6. Versions 1–5 remain
readable. The old fixed-key `.cs` writer and its IPC commands have been removed.
Only bounded, read-only compatibility remains for existing `.cs` files through
the directory-backup screen. Those old files do not contain system-vault entries.

## Encryption and implementation

Portable envelope: `INTERLUDE-PORTABLE-1`, a random 16-byte salt, random 12-byte
nonce and AES-256-GCM ciphertext. The key is derived using Argon2id v1.3 with
64 MiB memory, three iterations, one lane and 32-byte output. Version-one
parameters are fixed, so untrusted headers cannot request arbitrary KDF costs.
See the [RustCrypto Argon2 API](https://docs.rs/argon2/0.6.0/argon2/struct.Argon2.html).

Payloads are bounded to 20 MiB. Encrypted bytes are written to a temporary file
in the destination directory, flushed and atomically persisted. Only encrypted
data reaches the staging file. Plaintext serialized buffers and derived keys
use zeroizing storage. Password/OTP-bearing saved-login values have redacted
debug formatting. No secret is returned to the UI's status/result data.

Native export/import and saved-login changes use the account-operation lock
outside the UI thread. Keyring failures abort complete export rather than
silently creating a backup missing the saved-login entries.

## Validation

The standalone production-module test harness is:

```
cargo test --manifest-path apps/desktop/src-tauri/tests/folder-sync/Cargo.toml
```

Tests cover password encryption/decryption, incorrect passwords, modified and
truncated files, ciphertext secrecy, atomic encrypted writes, vault transaction
rollback and a real system-credential-store round trip using a random synthetic
entry. That test saves a synthetic password/TOTP configuration, encrypts it,
deletes the entry, decrypts and restores it, then verifies the password and TOTP
output. Its temporary keyring entry is cleaned up; no user accounts are read.

Real account login, installing the packaged build and restoring between two
physical computers remain interactive checks. Browser preview disables native
file and vault actions; it is not an alternative credential backup surface.

The completed checks for this change passed: 445 desktop test files / 3,000
tests, 16 native module tests, the desktop production build, native check and
Clippy, touched Rust formatting, and centralized i18n validation. Existing
unused-code and bundle-size warnings remain. Browser inspection confirmed the
offline-first tab order, switching to the optional directory tab without nested
dialogs, one password field in restore mode, and no horizontal overflow.
