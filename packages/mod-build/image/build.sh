#!/usr/bin/env bash
# The builder image for the layouts in layouts.json: found in the account's
# private registry if this exact set of inputs was built before, built and
# pushed if not. Prints the image pinned by digest, and writes the layouts it
# carries to LAYOUTS_OUT as JSON.
#
#   build.sh LAYOUTS_OUT
#
# The image is GCC, coreutils and tgg-mod (flake.nix), plus one folder per
# layout at /opt/tgg/sdks/<layout id>/ holding that port build's game SDK and
# symbol list. Each layouts.json entry names a port and the tgg-mod-runtime
# revision to build it from; the runtime's flake pins the port's own revision.
# Everything is built from pinned inputs, and the SDKs (which hold decomp
# headers) only ever go to the private registry.
#
# Needs nix, git, jq, crane, curl and pnpm; CLOUDFLARE_ACCOUNT_ID, and
# CLOUDFLARE_API_TOKEN or a cf CLI login.
set -euo pipefail

out=${1:?usage: build.sh LAYOUTS_OUT}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
package=$(cd "$here/.." && pwd)
repository="registry.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID:?}/tgg-mod-builder"

# Bump when the steps below change what goes into the image.
format=1
# Everything that decides the image's contents names it.
inputs=$( (echo "format $format" && cd "$here" && cat layouts.json flake.nix flake.lock tgg-mod/Cargo.toml tgg-mod/Cargo.lock) |
  sha256sum | cut -c1-32)
tag="$repository:inputs-$inputs"

stage=$(mktemp -d)
trap 'chmod -R u+w "$stage"; rm -rf "$stage"' EXIT

# Short-lived registry credentials, kept out of the home folder.
export DOCKER_CONFIG="$stage/docker"
credentials=$(cd "$package" && pnpm exec wrangler containers registries credentials \
  registry.cloudflare.com --push --pull --expiration-minutes 60 --json)
crane auth login registry.cloudflare.com \
  -u "$(jq -r .username <<<"$credentials")" -p "$(jq -r .password <<<"$credentials")" >&2

if digest=$(crane digest "$tag" 2>/dev/null); then
  echo "build.sh: $tag exists" >&2
else
  echo "build.sh: building $tag" >&2
  nix build "$here#tgg-mod" --out-link "$stage/tgg-mod" >&2
  nix build "$here#image" --out-link "$stage/image" >&2
  mkdir -p "$stage/root/opt/tgg/sdks" "$stage/archive"

  layouts="[]"
  count=$(jq length "$here/layouts.json")
  for ((i = 0; i < count; i++)); do
    port=$(jq -r ".[$i].port" "$here/layouts.json")
    runtime=$(jq -r ".[$i].runtime" "$here/layouts.json")
    checkout="$stage/runtime-$i"
    git init -q "$checkout"
    git -C "$checkout" fetch -q --depth 1 \
      https://github.com/texturesgg/tgg-mod-runtime.git "$runtime"
    git -C "$checkout" checkout -q FETCH_HEAD
    # The runtime's dev shell pins the port's revision and the toolchain.
    (cd "$checkout" && nix develop --command "ports/$port/port" build) >&2

    sdk="$checkout/.port/build/tgg-game-sdk"
    # melee-pc's executable; another port's script names its own.
    "$stage/tgg-mod/bin/tgg-mod" layout "$checkout/.port/build/melee" -o "$sdk/tgg-layout.json" >&2
    abi=$(jq -r .game_abi "$sdk/tgg-layout.json")
    cp -r "$sdk" "$stage/root/opt/tgg/sdks/$abi"
    port_rev=$(jq -r '.nodes["melee-pc"].locked.rev' "$checkout/flake.lock")
    layouts=$(jq -c --arg port "$port" --arg version "$port_rev+tgg-mod-runtime@$runtime" \
      --slurpfile layout "$sdk/tgg-layout.json" \
      '. + [{id: $layout[0].game_abi, api: $layout[0].api, port: $port,
             target: $layout[0].target, portVersion: $version}]' <<<"$layouts")
  done

  # The Nix image is a docker-archive: each layer a tar named in manifest.json.
  "$stage/image" >"$stage/image.tar"
  tar -xf "$stage/image.tar" -C "$stage/archive"
  for layer in $(jq -r '.[0].Layers[]' "$stage/archive/manifest.json"); do
    tar -xf "$stage/archive/$layer" -C "$stage/root"
  done
  config="$stage/archive/$(jq -r '.[0].Config' "$stage/archive/manifest.json")"

  # Cloudflare's image preparation fails on read-only folders, and every Nix
  # store path is read-only, so the image is one owner-writable layer. Fixed
  # order, owners and times keep the same inputs giving the same layer.
  chmod -R u+w "$stage/root"
  tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 \
    -C "$stage/root" -cf "$stage/layer.tar" .
  pushed=$(crane append --oci-empty-base -f "$stage/layer.tar" -t "$tag")
  env_flags=()
  while IFS= read -r line; do env_flags+=(--env "$line"); done < <(jq -r '.config.Env[]' "$config")
  crane mutate "$pushed" --set-platform linux/amd64 \
    --cmd "$(jq -r '.config.Cmd | join(",")' "$config")" \
    --workdir "$(jq -r .config.WorkingDir "$config")" "${env_flags[@]}" \
    --label "gg.textures.layouts=$(base64 -w0 <<<"$layouts")" -t "$tag" >&2
  digest=$(crane digest "$tag")
fi
image="$repository@$digest"

# Wait for Cloudflare to prepare the image to run, so a deploy never waits.
# Without an API token (on a workstation), the cf CLI's login asks instead.
prepare() {
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    curl -fsS -X POST \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
      --data "$(jq -cn --arg image "$image" '{image: $image}')" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/containers/image-preparations" |
      jq -r '.result.status // .status'
  else
    cf containers images prepare --image "$image" 2>/dev/null | sed -n '/^{/,/^}/p' | jq -r .status
  fi
}
status=pending
for _ in $(seq 180); do
  status=$(prepare)
  [ "$status" = "ready" ] && break
  sleep 10
done
[ "$status" = "ready" ] || { echo "build.sh: image preparation did not finish ($status)" >&2; exit 1; }

# The layouts ride on the image as a base64 label (crane's labels split on commas).
crane config "$image" | jq '.config.Labels["gg.textures.layouts"] | @base64d | fromjson' >"$out"
echo "$image"
