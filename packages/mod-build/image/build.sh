#!/usr/bin/env bash
# The builder image for the layouts in layouts.json: found in the account's
# private registry if this exact set of inputs was built before, built and
# pushed if not. Prints the image pinned by digest, and writes the layouts it
# carries to LAYOUTS_OUT as JSON.
#
#   build.sh LAYOUTS_OUT
#
# The image is GCC, coreutils and tgg (flake.nix), plus one folder per
# layout at /opt/tgg/sdks/<layout id>/ holding a tgg-melee release's game SDK
# (fetch-sdks.sh). Everything comes from pinned inputs, and the SDKs (which
# hold decomp headers and the game's source) only ever go to the private
# registry.
#
# Needs nix, jq, crane, curl, sha256sum, tar and pnpm; CLOUDFLARE_ACCOUNT_ID,
# and CLOUDFLARE_API_TOKEN or a cf CLI login.
set -euo pipefail

out=${1:?usage: build.sh LAYOUTS_OUT}
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
package=$(cd "$here/.." && pwd)
repository="registry.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID:?}/tgg-mod-builder"

# Bump when the steps below change what goes into the image.
format=2
# Everything that decides the image's contents names it.
inputs=$( (echo "format $format" && cd "$here" && cat layouts.json flake.nix flake.lock) |
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
  nix build "$here#image" --out-link "$stage/image" >&2
  mkdir -p "$stage/root" "$stage/archive"
  "$here/fetch-sdks.sh" "$stage/root" "$stage/layouts.json" >&2
  layouts=$(jq -c . "$stage/layouts.json")

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
# Preparing a new image has taken close to an hour.
for _ in $(seq 540); do
  status=$(prepare)
  [ "$status" = "ready" ] && break
  sleep 10
done
[ "$status" = "ready" ] || { echo "build.sh: image preparation did not finish ($status)" >&2; exit 1; }

# The layouts ride on the image as a base64 label (crane's labels split on commas).
crane config "$image" | jq '.config.Labels["gg.textures.layouts"] | @base64d | fromjson' >"$out"
echo "$image"
