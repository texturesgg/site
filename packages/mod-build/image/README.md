# The builder image

The image the build Workflow compiles mods in: GCC (the nixpkgs revision
tgg-mod-runtime builds ports with), coreutils and `tgg-mod`, built with Nix
(`flake.nix`), plus one folder per active game layout at
`/opt/tgg/sdks/<layout id>/` holding that port build's game SDK and symbol list.
The SDKs hold decomp headers, so the image lives only in the account's private
registry.

`push.sh` builds and pushes it. It repacks the image as one owner-writable
layer, because Cloudflare's image preparation fails on Nix's read-only store,
and prints the image pinned by digest.

## Registering a layout

A layout is one port build's game layout id. To build mods for a new one:

1. Build the port with the mod loader (in tgg-mod-runtime,
   `ports/melee-pc/port build`) and copy its `tgg-game-sdk/` out of the build
   tree, since the next port build rewrites it.
2. Add the layout's symbol list beside the SDK:

   ```sh
   tgg-mod layout <port build>/melee -o <sdk copy>/tgg-layout.json
   ```

3. Push the image with every active layout, using credentials from
   `cf containers registries credentials generate registry.cloudflare.com
--expiration-minutes 30 --permissions push pull` in `DOCKER_CONFIG`:

   ```sh
   ./push.sh registry.cloudflare.com/<account id>/tgg-mod-builder <sdk copy>...
   ```

4. Check that Cloudflare can run it (`status` must reach `ready`):

   ```sh
   cf containers images prepare --image <printed image>
   ```

5. Put the printed digest in `wrangler.toml` for each environment, and add the
   layout's row to `code_mod_layouts` (id, `tgg/1`, port, target, port version).
   The next tag a mod pushes builds for it; existing releases keep their builds.

To retire a layout, set its row's `active` to false. It gets no new builds, and
its packages stay downloadable.
