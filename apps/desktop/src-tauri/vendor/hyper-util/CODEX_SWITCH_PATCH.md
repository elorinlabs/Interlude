This is the source of `hyper-util` 0.1.20 from crates.io, licensed under MIT (see `LICENSE`).
Original crate checksum: `96547c2556ec9d12fb1578c4eaf448b04993e7fb79cbaad930a656880a6bdfa0`.

The protocol fix is in `src/client/legacy/connect/proxy/socks/v4/messages.rs`:
encode an empty SOCKS4 USERID with one terminating zero byte instead of two, and
adjust the encoded lengths. The extra byte otherwise becomes an empty SOCKS4a
destination domain, or an unexpected byte before HTTP/TLS traffic for SOCKS4.

The unused `timer` argument in `src/client/legacy/client.rs` is also renamed to
`_timer` so HTTP/1-only builds stay warning-free; its behavior is unchanged.

The app's strict TCP fixtures in `src/system_proxy/transport_tests.rs` reproduce
the failure and verify both blocking and asynchronous HTTP clients.

The normalized Cargo manifest omits upstream example/test targets, which are
not needed to build this dependency. Library sources, README and license are
otherwise preserved. This copy should be removed once a released upstream
version passes those same SOCKS4/4a wire-protocol tests without the patch.
