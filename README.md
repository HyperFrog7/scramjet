<div align="center">
  <img src="assets/driftproxy-wordmark.png" height="120" alt="Drift Proxy" />
</div>

---

**Drift Proxy** is an interception-based web proxy engine: it rewrites and sandboxes arbitrary web content in the browser so that pages load through a proxy without breaking, while instruments like `fetch`, `WebSocket`, `location` and the DOM are patched to keep the proxied page coherent.

It is a **fork of [Scramjet](https://github.com/MercuryWorkshop/scramjet)**, originally developed by [Mercury Workshop](https://github.com/MercuryWorkshop). See [NOTICE](./NOTICE) for the attribution and a description of what this fork changes. Drift Proxy is not endorsed by or affiliated with the upstream project.

## What it does

- Rewrites HTML, CSS, JavaScript, WASM and worker scripts so that URLs resolve through the proxy prefix.
- Sandboxes page globals (`location`, `history`, `cookie`, `postMessage`, storage, caches, IndexedDB) so a site cannot escape into the real origin.
- Proxies HTTP(S) and WebSocket traffic over a [Wisp](https://github.com/MercuryWorkshop/wisp) transport, with `Set-Cookie`, `Referer`, `Sec-Fetch-*` and redirect chains translated back to the real origin's semantics.

## Supported sites

Some of the popular websites that work include:

- [Google](https://google.com)
- [YouTube](https://youtube.com)
- [Instagram](https://instagram.com)
- [ChatGPT](https://chatgpt.com)
- [Reddit](https://reddit.com)
- [Twitter](https://twitter.com)
- [Discord](https://discord.com)
- [Spotify](https://spotify.com)
- [GeForce NOW](https://play.geforcenow.com/)
- [now.gg](https://now.gg)

## Development

### Dependencies

- Recent versions of `node.js` and `pnpm` (Node 24 is what CI uses; see `.nvmrc`)
- `rustup`
- `wasm-bindgen`
- [Binaryen's `wasm-opt`](https://github.com/WebAssembly/binaryen)
- [this `wasm-snip` fork](https://github.com/r58Playz/wasm-snip)

### Building

```sh
pnpm i
cd packages/core
pnpm rewriter:build   # builds the Rust/WASM rewriter, needs the toolchain above
pnpm build
```

### Running locally

```sh
pnpm dev
```

The demo runs at <http://localhost:4141> and rebuilds on file changes (excluding the rewriter). A local Wisp server is started alongside it.

### Checks

```sh
pnpm format:check                       # Prettier, configured for tabs
pnpm --filter driftproxy lint           # ESLint, includes the no-globals/no-instanceof rules
pnpm --filter driftproxy typecheck      # tsc --noEmit, whole package
pnpm --filter driftproxy test:package   # built bundle structure
```

## Compatibility note

The `$scramjet$`-prefixed globals, `scramjet-` DOM attribute names and `scramjet.js` build artifact filenames are retained. They are an internal interface shared between the JavaScript client, the WebAssembly rewriter and integrators that override `config.globals`. Renaming them would be a breaking change for downstream proxies, so they keep their historical names. See [NOTICE](./NOTICE).

## License

[AGPL-3.0-only](./LICENSE), inherited from the upstream project.
