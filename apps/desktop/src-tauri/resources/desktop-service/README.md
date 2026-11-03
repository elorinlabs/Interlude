# Windows unattended desktop runtime

`scripts/prepare-desktop-service.mjs` bundles the dedicated host and installs a checksum-pinned Node.js runtime here.
Generated executables, bundled JavaScript and third-party notices are build artifacts. The installer verifies their
hashes against a manifest embedded in the application before placing them in its administrator-owned service directory.

Build desktop packages through `npm run build:app`; ordinary source checks do not download this optional runtime.

The preparation step also builds `desktop-unlock.dll`, the Windows sign-in component used by automatic unlock.
Its source, protocol, lifecycle and verification notes are in `../../desktop-unlock/README.md`.
