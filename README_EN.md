<p align="center"><img src="apps/desktop/public/interlude-logo.svg" width="88" alt="Interlude" /></p>
<h1 align="center">Interlude</h1>
<p align="center">Less repetition. More focus.<br />A focused account companion for Codex.</p>
<p align="center"><b>English</b> · <a href="README.md">简体中文</a> · <a href="https://github.com/elorinlabs/Interlude/releases/latest">Download</a> · <a href="https://github.com/elorinlabs/Interlude/issues/new">Report an issue</a></p>
<p align="center"><img alt="Platform" src="https://img.shields.io/badge/Windows-x64-397DA8" /> <img alt="License" src="https://img.shields.io/badge/License-Apache--2.0-6256BD" /> <img alt="Author" src="https://img.shields.io/badge/Author-JingXing-56685D" /></p>

Interlude brings Codex account management, quota visibility, account switching and credential backups into a small desktop utility. It works with the installed official Codex app to reduce repeated account-management steps.

**Current release: Windows x64. Author: JingXing.** The app offers Chinese and English among its language choices. This guide and the [Chinese guide](README.md) cover the same workflows.


Switch between Chinese and English on the home screen. Choose Original, Navy office, Warm sand or Quiet sage; preferences persist and synchronize with the desktop widget.

## Features

| Feature | What it does |
| --- | --- |
| Add and merge | Browser authorization, private browsing and existing credential-file import; merge duplicate accounts |
| Switch and launch | Manually switch accounts and launch official Codex while keeping the same local conversation directory |
| Account health | Individual/batch checks, repair actions and saved-login recovery with visible progress |
| Quota visibility | Five-hour/weekly remaining quota, reset times returned by the service and background updates for the current account |
| Desktop widget | A separate current-account quota window, controlled from the home screen |
| Token history | Inspect locally available usage records by account and time |
| Optional automation | Schedule greetings against quota reset times and relay an existing goal; requires explicit configuration |
| Complete backups | One encrypted file for accounts, saved passwords, authenticator secrets and automatic-login settings |
| Directory backups | Local disk, removable storage or a cloud client's synchronized folder; no former sync server required |

Token totals reflect locally readable records, not an authoritative account-lifetime total across every device. Login recovery still needs your input when the provider requires a human challenge. Antigravity implementation source remains available, but its entry is disabled.

## Install and start

1. Download `Interlude_*_x64-setup.exe` from [Releases](https://github.com/elorinlabs/Interlude/releases/latest).
2. Compare its SHA-256 with `SHA256SUMS.txt` on the release page. The current installer is unsigned; Windows may show an unknown-publisher prompt. Verify its source before deciding to install.
3. Install and open Interlude. Install official Codex separately, then add an account through browser authorization or an existing credential file.
4. Inspect account status and switch or launch Codex when needed. Make a complete backup of existing data first.

Interlude has its own application identifier and can coexist with the original tool. Compatibility depends on your environment and the release notes. Installation does not automatically migrate all data from other tools.

## Back up without a server

Open **Backup & restore → Offline complete backup**, choose a passphrase of at least 12 characters, and save one `.interlude-backup` file. On a new computer or after reinstalling Windows, restore using the same file and passphrase.

- Includes saved account credentials, passwords, original authenticator secrets and automatic-login settings. Information never saved cannot be recovered.
- Keep the file on storage that will survive reinstallation, and keep its passphrase separately. There is no password-reset service.
- For automatic snapshots, choose a cloud client's local synchronized directory. Presets include Nutstore, Baidu Netdisk, Aliyun Drive, Quark, Weiyun, 123 Cloud Drive and OneDrive. The client transports the files; these are not direct cloud-provider API integrations.
- Legacy `.cs` files remain import-only. New backups use the complete encrypted format.

Details: [Offline backups](docs/offline-backup.md) · [Directory and cloud-folder backups](docs/local-cloud-sync.md).

## Frequently asked questions

**Will switching preserve my conversation?** The local Codex conversation directory is reused. This does not transfer a provider account's data or guarantee access to the same cloud resources from another account. Switching interrupts work running in the official app; watch the status feedback.

**Why might I still need to sign in?** Restoring a backup restores saved data. The provider may invalidate tokens or require a human challenge; permanent login cannot be guaranteed.

**Does everything need a server?** Current account management and backups do not need the former account-sync server. Authorization, quota checks, Codex requests and your chosen cloud client still use their respective services.

**How are secrets handled?** Automatic-login credentials use the system credential store. Complete encrypted backups contain saved passwords and TOTP secrets. Protect your Windows account, backup passphrases and recovery keys. Redact all public reports. See [Security](SECURITY.md).

## Develop from source

Install Node.js 22+, npm, Rust stable and the Windows Tauri prerequisites (MSVC C++ tools and WebView2).

```powershell
git clone https://github.com/elorinlabs/Interlude.git
cd Interlude
npm ci
npm run dev:app
```

Use `npm run dev` for a frontend-only preview without native credential or process access.

```powershell
npm run build
npm run check:i18n
node scripts/build-desktop-app.mjs --bundles nsis
```

Root build/test/check commands target the current desktop utility. Other workspaces and their shared modules remain for dependency compatibility; their presence does not enable embedded chat, proxy management or remote desktop in the installer. Optional VC-LTL / YY-Thunks build tools are not distributed with the source.

## Documentation and contributions

[Security](SECURITY.md)

The cleaned desktop source passed 1,287 tests, 18 native backup tests and compilation checks. This does not certify every real account, Codex version or cross-computer recovery flow. Existing compiler warnings remain.

## Attribution and license

Derived from [piperhex/remoteai](https://github.com/piperhex/remoteai) and distributed under [Apache-2.0](LICENSE). See [NOTICE](NOTICE) for attribution. Upstream and third-party license notices are retained. The target repository's initial MIT file is preserved as a [historical license](docs/licenses/repository-initial-MIT.txt).

Interlude is an independent community project, not an official OpenAI or Codex product. Product names and trademarks belong to their respective owners.
