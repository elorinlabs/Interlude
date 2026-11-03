# Windows X server

Windows packages include the unmodified VcXsrv 21.1.16.1 runtime, launched as a
separate process. It is not linked into Remote AI. Its license is in `COPYING`;
component notices in the upstream runtime remain in `runtime/`.

- Project: https://github.com/marchaesen/vcxsrv
- Release and corresponding source: https://github.com/marchaesen/vcxsrv/releases/tag/21.1.16.1
- Source archive: https://github.com/marchaesen/vcxsrv/archive/refs/tags/21.1.16.1.tar.gz
- Build instructions: https://github.com/marchaesen/vcxsrv/blob/21.1.16.1/HOW_TO_BUILD.txt

`node scripts/prepare-x-server.mjs` downloads the pinned official distribution,
verifies its SHA256, and extracts it with 7-Zip on the build machine. The upstream
installer is never executed. The generated runtime is ignored by Git and included
by Tauri packaging. Windows ARM64 runs this upstream x64 build via Windows x64
emulation. macOS uses an installed XQuartz; Linux uses its existing desktop display.

Saving an X11 profile, testing or connecting ensures the display is ready. Windows
starts VcXsrv only when the display is not listening, with a per-user MIT cookie
and access control enabled. Startup checks a bounded authenticated X11 handshake.
The cookie stays in the host PC's local application data and is never synchronized
or sent to the SSH server. An existing X server is reused without changing its
settings. The X server stays available after a terminal closes; forwarded X clients
still close with their SSH session.
