#!/bin/sh
# Installs tgg, the textures.gg command line, from its GitHub releases:
#
#   curl -fsSL https://textures.gg/install.sh | sh
#
# It downloads the archive for this system, checks it against the release's
# SHA256SUMS, and puts `tgg` in ~/.local/bin. TGG_VERSION picks a version
# (default: the latest); TGG_INSTALL_DIR picks the folder.
#
# Source: https://github.com/texturesgg/site/blob/main/packages/web/public/install.sh

set -eu

# Everything runs from main, called on the last line, so a download cut off
# partway runs nothing.
main() {
  case "$(uname -s)/$(uname -m)" in
    Linux/x86_64 | Linux/amd64) platform=x86_64-unknown-linux-musl ;;
    Linux/aarch64 | Linux/arm64) platform=aarch64-unknown-linux-musl ;;
    Darwin/*) platform=universal-apple-darwin ;;
    *) fail "there's no tgg build for $(uname -s) $(uname -m)" ;;
  esac
  need curl
  need tar

  version="${TGG_VERSION:-}"
  if [ -z "$version" ]; then
    version="$(curl -fsSL https://assets.textures.gg/cli/latest.json |
      sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
    [ -n "$version" ] || fail "couldn't find the latest tgg version"
  fi
  name="tgg-$version-$platform"
  base="https://github.com/texturesgg/texturesgg/releases/download/cli-v$version"

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "Downloading tgg $version for $platform"
  curl -fsSL "$base/$name.tar.gz" -o "$tmp/$name.tar.gz" || fail "couldn't download $base/$name.tar.gz"
  curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "couldn't download $base/SHA256SUMS"

  expected="$(awk -v file="$name.tar.gz" '$2 == file { print $1 }' "$tmp/SHA256SUMS")"
  actual="$(sha256 "$tmp/$name.tar.gz")"
  [ -n "$expected" ] || fail "SHA256SUMS doesn't list $name.tar.gz"
  [ "$expected" = "$actual" ] || fail "$name.tar.gz doesn't match its checksum; nothing was installed"

  tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
  dir="${TGG_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$dir"
  cp "$tmp/$name/tgg" "$dir/tgg.new"
  chmod 755 "$dir/tgg.new"
  mv "$dir/tgg.new" "$dir/tgg"
  echo "Installed tgg $version to $dir/tgg"

  case ":$PATH:" in
    *":$dir:"*) echo "Run tgg login to sign in." ;;
    *) echo "$dir isn't on your PATH yet; add it in your shell's config, then run tgg login." ;;
  esac
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    fail "this needs sha256sum or shasum to check the download"
  fi
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "this needs $1"
}

fail() {
  echo "install.sh: $1" >&2
  exit 1
}

main "$@"
