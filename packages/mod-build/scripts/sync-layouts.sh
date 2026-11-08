#!/usr/bin/env bash
# Make code_mod_layouts match LAYOUTS (the JSON image/build.sh writes): every
# layout it lists is active, with who builds it (the image, or for a layout
# the image doesn't carry, such as macOS, an external builder:
# scripts/external-build.sh), and every other one is retired (no new builds;
# its packages stay downloadable).
#
#   scripts/sync-layouts.sh preview|production LAYOUTS
set -euo pipefail

env=${1:?usage: sync-layouts.sh preview|production LAYOUTS}
layouts=$(realpath "${2:?usage: sync-layouts.sh preview|production LAYOUTS}")
here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
now=$(($(date +%s) * 1000))

# Ids, ports and targets come from the SDKs' tgg-game-sdk.json; quote them anyway.
sql=$(jq -r --arg now "$now" '
  def q: "'"'"'" + (tostring | gsub("'"'"'"; "'"'"''"'"'")) + "'"'"'";
  (map(
    "INSERT INTO code_mod_layouts (id, api, port, target, port_version, builder, active, created_at) VALUES ("
    + ([.id, .api, .port, .target, .portVersion,
        (if .builder == "image" then "image" else "external" end)] | map(q) | join(", "))
    + ", 1, " + $now + ") ON CONFLICT(id) DO UPDATE SET active = 1, port_version = excluded.port_version, builder = excluded.builder;"
  ) | join("\n")),
  "UPDATE code_mod_layouts SET active = 0 WHERE id NOT IN ("
    + (map(.id | q) | if length == 0 then ["'"'"''"'"'"] else . end | join(", ")) + ");"
' "$layouts")

# The db package's wrangler.toml is production at its top level, with preview
# as its one environment.
env_args=()
[ "$env" = preview ] && env_args=(--env preview)
cd "$here/../db"
pnpm exec wrangler d1 execute DB "${env_args[@]}" --remote --command "$sql"
