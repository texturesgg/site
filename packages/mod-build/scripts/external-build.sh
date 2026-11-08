#!/usr/bin/env bash
# Build mods for the layouts the builder image can't (builder `external`:
# macOS, which needs Apple's linker and SDK), on a machine of that system. It
# asks the registry which approved releases lack a build for each such layout
# of TARGET, fetches each one's source, builds it with `tgg mod build` against
# the layout's SDK, and uploads the package, or the compiler log of a mod that
# doesn't build (routes/external-builds.ts in the API checks and records it).
# Review covers the source, so only approved releases are offered.
#
#   external-build.sh pending TARGET   print how many builds are waiting
#   external-build.sh build TARGET     build and upload them
#
# Environment:
#   TGG_BUILDER_TOKEN   the registry's MOD_BUILDER_TOKEN (required)
#   TGG_API             the API, https://api.textures.gg by default
#   MAX_BUILDS          the most builds one run makes, 10 by default (at most 50)
#   RETRY_FAILED        1 to build again releases whose last build failed
#   RUN_URL             recorded with each build, such as the CI run's URL
#   TGG_MELEE_DOWNLOADS where SDK archives come from, as for image/fetch-sdks.sh
#   CC                  the C compiler [default: tgg's, Homebrew's gcc-15 on macOS]
#
# Needs bash, curl, jq, tar and shasum or sha256sum; and to build, what tgg
# doctor asks for (on macOS Homebrew's GCC, CMake, Ninja and Xcode's command
# line tools). Every download is pinned by SHA-256: tgg below, each SDK by
# image/layouts.json. Nothing the registry returns is run as shell code: ids
# are checked against fixed patterns before they name files or URLs.
set -euo pipefail

# The tgg release that packs: the one the builder image runs
# (image/flake.nix), so every layout's packages come from the same packer.
TGG_VERSION=0.4.0
TGG_DARWIN_SHA256=67706df47e93b95be7fddf919d45f117da2fac7b9a6681756bd5b9ce4d8a0a6e

usage() {
  echo "usage: external-build.sh pending|build TARGET" >&2
  exit 2
}
command=${1:-}
target=${2:-}
[[ $command == pending || $command == build ]] || usage
[[ $target =~ ^[a-z0-9_]+(-[a-z0-9_]+){2,3}$ ]] || usage

here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
api=${TGG_API:-https://api.textures.gg}
downloads=${TGG_MELEE_DOWNLOADS:-https://dl.textures.gg/tgg-melee}
max_builds=${MAX_BUILDS:-10}
[[ $max_builds =~ ^[0-9]+$ && $max_builds -ge 1 && $max_builds -le 50 ]] || {
  echo "external-build.sh: MAX_BUILDS must be 1 to 50" >&2
  exit 2
}
failed=skip
[ "${RETRY_FAILED:-0}" = 1 ] && failed=retry
: "${TGG_BUILDER_TOKEN:?external-build.sh needs TGG_BUILDER_TOKEN}"

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# A request to the registry. The token goes to curl on stdin, so it never
# appears in a process list.
registry() {
  printf 'Authorization: Bearer %s\n' "$TGG_BUILDER_TOKEN" |
    curl -sS --fail-with-body --retry 3 --max-time 300 -H @- "$@"
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

registry -o "$work/pending.json" \
  "$api/api/external-builds/pending?target=$target&failed=$failed&limit=$max_builds"
waiting=$(jq '[.layouts[].releases | length] | add // 0' "$work/pending.json")
if [ "$command" = pending ]; then
  echo "$waiting"
  exit 0
fi
if [ "$waiting" -eq 0 ]; then
  echo "external-build.sh: nothing to build for $target" >&2
  exit 0
fi

# The release archives name each target by its system.
case $target in
aarch64-apple-darwin) suffix=aarch64-macos tgg_asset=universal-apple-darwin tgg_sha=$TGG_DARWIN_SHA256 ;;
*)
  echo "external-build.sh: no external build for target $target" >&2
  exit 2
  ;;
esac

# tgg, pinned by version and SHA-256.
tgg_name="tgg-$TGG_VERSION-$tgg_asset"
curl -fsSL --retry 3 -o "$work/tgg.tar.gz" \
  "https://github.com/texturesgg/texturesgg/releases/download/cli-v$TGG_VERSION/$tgg_name.tar.gz"
[ "$(sha256 "$work/tgg.tar.gz")" = "$tgg_sha" ] || {
  echo "external-build.sh: $tgg_name.tar.gz doesn't match its pinned SHA-256" >&2
  exit 1
}
tar -xzf "$work/tgg.tar.gz" -C "$work"
tgg=$work/$tgg_name/tgg

# What every build ran with, recorded on it.
system=$(uname -sm)
command -v sw_vers >/dev/null && system="macOS $(sw_vers -productVersion) $(uname -m)"
compiler=${CC:-gcc-15}
builder="$system; $("$compiler" --version 2>/dev/null | head -n1 || echo "$compiler"); tgg $TGG_VERSION"
command -v xcrun >/dev/null && builder="$builder; macOS SDK $(xcrun --show-sdk-version)"
builder=${builder:0:200}
echo "external-build.sh: building with $builder" >&2

# A build sees neither the registry token nor a deployment target other than
# the SDK's.
build() {
  env -u TGG_BUILDER_TOKEN -u MACOSX_DEPLOYMENT_TARGET \
    "$tgg" mod build "$@"
}

problems=0
built=0
while IFS=$'\t' read -r layout version; do
  [[ $layout =~ ^[0-9a-f]{16}$ && $version =~ ^[0-9A-Za-z.+-]{1,64}$ ]] || {
    echo "external-build.sh: the registry named layout $layout, tgg-melee $version" >&2
    exit 1
  }
  # The layout's SDK, by the SHA-256 image/layouts.json pins for its release.
  want=$(jq -r --arg v "$version" --arg t "$target" \
    '.[] | select(.version == $v) | .sdks[$t] // empty' "$here/image/layouts.json")
  if [ -z "$want" ]; then
    echo "external-build.sh: image/layouts.json has no $target SDK for tgg-melee $version" >&2
    problems=$((problems + 1))
    continue
  fi
  name="tgg-melee-sdk-$version-$suffix"
  curl -fsSL --retry 3 -o "$work/$name.tar.gz" "$downloads/$version/$name.tar.gz"
  [ "$(sha256 "$work/$name.tar.gz")" = "$want" ] || {
    echo "external-build.sh: $name.tar.gz doesn't match image/layouts.json" >&2
    exit 1
  }
  tar -xzf "$work/$name.tar.gz" -C "$work"
  sdk=$work/$name
  [ "$(jq -r .game_abi "$sdk/tgg-game-sdk.json")" = "$layout" ] &&
    [ "$(jq -r .target "$sdk/tgg-game-sdk.json")" = "$target" ] || {
    echo "external-build.sh: $name is not layout $layout for $target" >&2
    exit 1
  }

  # The SDK's template first: if it doesn't build, the toolchain is broken,
  # and no mod's build is blamed for it.
  if ! build "$sdk/examples/template" --sdk "$sdk" -o "$work/template-$layout.zip" \
    >/dev/null 2>"$work/template-$layout.log"; then
    cat "$work/template-$layout.log" >&2
    echo "external-build.sh: the SDK's template doesn't build for $layout; check the toolchain" >&2
    exit 1
  fi

  while IFS=$'\t' read -r release mod mod_version; do
    [[ $release =~ ^[A-Za-z0-9_-]{1,64}$ ]] || {
      echo "external-build.sh: the registry named release $release" >&2
      exit 1
    }
    [ "$built" -lt "$max_builds" ] || break 2
    built=$((built + 1))
    echo "external-build.sh: $mod $mod_version ($release) for $layout" >&2
    dir=$work/$release-$layout
    mkdir -p "$dir"
    if ! registry -o "$dir/source.zip" "$api/api/external-builds/releases/$release/source"; then
      echo "external-build.sh: couldn't fetch $release's source" >&2
      problems=$((problems + 1))
      continue
    fi
    form=(--form-string "builder=$builder")
    [ -n "${RUN_URL:-}" ] && form+=(--form-string "run=${RUN_URL:0:300}")
    if build "$dir/mod" --source-zip "$dir/source.zip" --sdk "$sdk" \
      -o "$dir/package.zip" --json >"$dir/report.json" 2>"$dir/build.log"; then
      form+=(--form-string status=succeeded -F "package=@$dir/package.zip"
        -F "report=@$dir/report.json")
    else
      status=$?
      echo "external-build.sh: $mod $mod_version doesn't build (tgg exited $status):" >&2
      tail -n 20 "$dir/build.log" >&2
      form+=(--form-string status=failed --form-string "error=tgg mod build exited $status")
    fi
    # The registry keeps the last megabyte of the log.
    tail -c 1048576 "$dir/build.log" >"$dir/log.txt"
    form+=(-F "log=@$dir/log.txt;type=text/plain")
    if ! registry -X PUT "${form[@]}" -o "$dir/upload.json" \
      "$api/api/external-builds/releases/$release/builds/$layout"; then
      echo "external-build.sh: the registry refused $release's build: $(cat "$dir/upload.json" 2>/dev/null)" >&2
      problems=$((problems + 1))
    fi
  done < <(jq -r --arg l "$layout" \
    '.layouts[] | select(.id == $l) | .releases[] | [.id, .mod, .version] | @tsv' \
    "$work/pending.json")
done < <(jq -r '.layouts[] | select(.releases | length > 0) | [.id, .portVersion] | @tsv' \
  "$work/pending.json")

echo "external-build.sh: $built built, $problems problems" >&2
[ "$problems" -eq 0 ]
