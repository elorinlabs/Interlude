# Remote chat transport compatibility

## Native packet compression

Transport v2 peers advertise `packetCompression: "deflate-raw-v1"` in authenticated,
uncompressed ping/pong frames. Only a peer advertising the same capability receives
compressed data. Old peers and old native binaries retain the original plaintext format.
Capabilities belong to the encrypted session and survive direct/relay switches and socket
reconnection; a new session negotiates again. Legacy transport v1 stays uncompressed.

Each data fragment is compressed independently before encryption. Inputs below 256 UTF-8
bytes are skipped. Compression is used only if the complete compressed body saves at least
32 bytes and 10%. Control frames remain uncompressed. Binary `CSB1` routing is unchanged;
there is no network Base64 or hexadecimal wrapper around the compressed plaintext.

The second 32-bit big-endian nonce word is 0 for legacy plaintext or 1 for DEFLATE v1.
The nonce is authenticated by ChaCha20-Poly1305, and the sequence remains shared across both
formats. Compressed plaintext contains a two-byte big-endian original byte length followed
by one raw DEFLATE stream. Authentication and replay rejection precede decompression.
The decoded packet cannot exceed 19,972 bytes, must match its declared length exactly, and
must contain a complete stream without trailing bytes. Unknown nonce format IDs are rejected.

Desktop and Android/iOS use the shared Rust codec at compression level 1 on native workers.
Android reserves a separate bounded executor so network polling cannot delay codec tasks.
New Android binaries combine UTF-8 conversion, Rust DEFLATE and platform AEAD in one async
native call per direction. Intermediate plaintext and compressed bytes never cross the JS
bridge. The native encoder applies the same threshold and saving policy, sets the authenticated
nonce flag, and returns the existing ciphertext representation. JS reserves send sequences
before dispatch and suppresses pending duplicates; receive sequences enter the shared replay
window only after successful native completion and are checked again against newer arrivals.
Older Android binaries, iOS, desktop and Web retain their existing codec adapters and wire format.
Web uses native `CompressionStream`/`DecompressionStream` in a dedicated Worker; its browser
chooses the compression level because that API does not expose one. Both produce interoperable
raw DEFLATE. Browsers without native raw-DEFLATE support advertise no compression capability.
JavaScript performs framing, size checks and IPC encoding only; it has no compression algorithm.

Pending native work is bounded, heartbeats bypass it, and completion after closing a session
cannot send or deliver data. The receiving delivery lanes still handle out-of-order fragments,
retries and duplicates independently.

The coordinator continues to use WebSocket/TCP. No UDP or QUIC transport is introduced.

## Relay recovery and credential renewal

A missing encrypted pong describes one peer path, not the host's shared coordinator socket.
Only viewers reconnect their individual socket after a relay heartbeat timeout. Hosts keep
probing that session while native WebSocket ping/pong handles shared socket failures, so a
suspended viewer cannot disconnect other chats.

Go coordinators advertise `authRenewal: true` in `chat-policy`. An authenticated endpoint may
send `renew-auth` with a fresh `accessToken` on the same socket. The coordinator verifies the
original owner, device, role and credential kind, replaces its expiry timer, updates the
bound session leases and replies with `auth-renewed`. Expired sessions cannot be revived.
Lease updates retain the existing `resumed` envelope with `renewed: true`; updated clients
extend their deadline without resetting the healthy relay path or pending requests.

Clients negotiate again for each socket and retain the resumable reconnect fallback for
older coordinators. Missing renewal acknowledgements also trigger bounded recovery. Native
desktop credentials remain in Rust and are never supplied through frontend IPC.

## Binary relay hop

A client advertises `binaryRelay: true` in authentication. The Go coordinator confirms it in
`chat-policy` before any session traffic. Each hop negotiates independently: one endpoint can
use binary while the other still uses JSON. A client connecting to an older coordinator sends
JSON unless that coordinator explicitly confirms support. Reconnection resets negotiation.

Binary messages contain `CSB1`, a one-byte session-ID length, the ASCII session ID (1–128 bytes),
then the unchanged authenticated ciphertext (at most 20,000 bytes). Routing, authorization,
rate limits and quotas still apply. Quotas count the encoded envelope actually written, as
with the previous JSON accounting; WebSocket/TLS headers are not included.

Hexadecimal remains the compatibility representation inside the typed native IPC and existing
encryption API. It is removed from the negotiated WebSocket hop. For a 10,000-byte ciphertext
and a nine-byte session ID, the new envelope is 10,014 bytes. Control messages remain JSON.

## Independent response delivery

Transport v2 peers advertise `parallelResponses: true` in authenticated ping/pong frames.
Until a peer advertises support, all application traffic uses the existing ordered delivery.
After negotiation, responses use a separate `responses` lane with its own bounded send window,
sequence space, cumulative acknowledgements, retry timers and fragment-ID namespace.
Response fragments can enter assembly out of order, so a missing history fragment does not
prevent another complete response from being delivered. Events and commands retain their
original ordering and have an independent window so a stalled response cannot fill it.

Duplicates are discarded within each lane. Both lanes survive direct/relay switches and relay
reconnection. This removes application-level coupling; it does not eliminate TCP head-of-line
blocking or the existing reliable ordered DataChannel's transport-level blocking.
