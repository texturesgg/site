# hsd-render-web

Browser adapter for [`hsd-render`](https://crates.io/crates/hsd-render): the
textures.gg 3D preview, drawn on a canvas by that crate's Rust wgpu renderer.

It is built twice, one build per wgpu web backend:

| Import                       | Feature  | Size (gzip)  | When the site loads it                                                                |
| ---------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------- |
| `@vgskins/hsd-render/webgpu` | `webgpu` | about 0.2 MB | By default                                                                            |
| `@vgskins/hsd-render/webgl`  | `webgl`  | about 0.9 MB | When WebGPU is unavailable (it adds wgpu's GL backend and runtime shader translation) |

```sh
pnpm --filter @vgskins/hsd-render build   # both, with the wasm-release profile
```

JavaScript owns the DOM work: animation frames and the 60 Hz tick clock,
input, resizing, visibility and reduced motion. Rust owns parsing, idle
playback and the GPU. `HsdScene` parses a DAT and attaches idle from
reference bytes, which the Rust store admits by catalog size and SHA-256.
`HsdViewer` draws it on a canvas. Errors are `Error`s with a `code`:
`gpu-unavailable` means this build's backend cannot start, so the caller may
fall back to the other build on a fresh canvas.
