# Windows automatic unlock

The additional Credential Provider handles `CPUS_LOGON` and `CPUS_UNLOCK_WORKSTATION`.
It does not filter or replace any system provider, change Windows autologon settings, or type a password into a window.
Windows performs authentication after `GetSerialization` returns the protected credential buffer.
Local/domain accounts use the Kerberos interactive buffer; MicrosoftAccount/AzureAD qualified names use the identity
provider buffer. Windows Hello PINs, passwordless-only policies, and interactive MFA cannot be supplied as passwords.

The desktop service installer registers a content-addressed DLL in an administrator-owned directory separate from
the service runtime. This allows service upgrades while LogonUI still holds the previous DLL open. Rollback restores
the previous provider; uninstall removes registration and schedules deletion of an in-use DLL at reboot.

Only a live, control-authorized desktop lease can save credentials or request a login. Credentials are bound to the
installed service identity, device and Windows owner SID. Passwords use machine DPAPI inside the existing SYSTEM/admin
only service data directory, are never returned in snapshots, and are removed when disabled or uninstalled. The viewer
uses the existing encrypted remote RPC. The password is cleared on submission, cancellation or disconnection;
failed saves keep the account field and show an error in the fixed panel footer. A successful save is acknowledged
independently of the immediate sign-in attempt, so an unavailable console cannot make saved credentials appear disabled.

Every new connection reads the controlled computer's stored configuration. Non-secret security preferences
(disconnect locking, speaker muting, clipboard sync and privacy mode) live in `remote-desktop-security.json` alongside
host settings, or in the protected service data directory for unattended hosts. They survive capture and service worker
restarts. Audio and privacy cleanup restores the physical devices without deleting preferences. Privacy restoration
uses the existing authorized display transaction; a failed restoration is not repeated by automatic reconnection.
Changing the installed service identity resets these preferences as well as deleting the bound credentials.

Each login request is DPAPI protected, targets the current console session, expires after ten seconds, and has a unique
nonce. The provider atomically claims it before serialization. The host persists a blocked marker before dispatch,
so crashes, rejected passwords and expired requests do not automatically retry on reconnect. A status report cannot
alone mark an unlock successful: the host also verifies the console is unlocked under the expected SID. Windows
Secure Attention Sequence policy is respected; no machine policy is changed to bypass sign-in restrictions.

Build and run native tests with `node scripts/build-desktop-unlock.mjs` from the repository root. Tests exercise COM
activation, event notification, DPAPI handoff, credential serialization, replay rejection, invalid/expired requests,
and cleanup in a private temporary directory. They do not register a provider or authenticate a Windows account.
`npm run check:rust` also runs these tests on Windows x64. Package through `npm run build:app` to include the DLL and
its integrity manifest in unattended-service installation and updates.

Before release, test on an isolated Windows machine using a disposable account: initial sign-in after reboot,
unlock after locking, a wrong password followed by reconnection, credential replacement/deletion, control permission
revocation, service update/rollback/uninstall, and disconnect during an attempt. Exercise local, domain and Microsoft
account configurations separately. Check that other Windows sign-in methods still work and that service/SAS policy
restrictions report failure without retrying. Automated component tests do not establish end-to-end LogonUI success.

API references: [Credential count and automatic logon](https://learn.microsoft.com/windows/win32/api/credentialprovider/nf-credentialprovider-icredentialprovider-getcredentialcount),
[credential serialization](https://learn.microsoft.com/windows/win32/api/wincred/nf-wincred-credpackauthenticationbufferw),
[SendSAS requirements](https://learn.microsoft.com/windows/win32/api/sas/nf-sas-sendsas).
