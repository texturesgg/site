#!/usr/bin/env bash
# Wait until Cloudflare has prepared IMAGE (pinned by digest) to run as a
# container, logging every check. POST /containers/image-preparations starts
# a preparation or reports on the one in progress: pending (HTTP 202), or
# ready or error (HTTP 200), with a reason. Wrangler's deploy asks the same
# endpoint; asking first means the deploy doesn't wait, and the layouts only
# go live once the image can run.
#
#   prepare.sh IMAGE
#
# Gives up after PREPARE_TIMEOUT_MINUTES (30 by default). Checks start 10
# seconds apart and back off to 2 minutes: every new image so far stayed
# pending while it was checked every 10 seconds, and was ready within a
# minute or two of the checks stopping.
#
# Needs curl and jq; CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN or a
# cf CLI login.
set -euo pipefail

image=${1:?usage: prepare.sh IMAGE}
deadline=$((SECONDS + ${PREPARE_TIMEOUT_MINUTES:-30} * 60))
body=$(mktemp)
trap 'rm -f "$body"' EXIT

# Writes the response to $body and sets $code (000 when there was no response).
ask() {
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    code=$(curl -sS --connect-timeout 10 --max-time 60 -o "$body" -w '%{http_code}' -X POST \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
      --data "$(jq -cn --arg image "$image" '{image: $image}')" \
      "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:?}/containers/image-preparations") ||
      code=000
  else
    # Without an API token (on a workstation), the cf CLI's login asks instead.
    code=200
    cf containers images prepare --image "$image" 2>/dev/null | sed -n '/^{/,/^}/p' >"$body" || code=000
  fi
}

field() { jq -r "$1" "$body" 2>/dev/null || true; }

interval=10
while :; do
  ask
  status=$(field '.result.status // .status // empty')
  reason=$(field '.result.reason // .reason // (.errors // [] | map(.message) | join("; ")) // empty')
  printf 'prepare.sh: %s (HTTP %s) after %dm%02ds%s\n' "${status:-no status}" "$code" \
    $((SECONDS / 60)) $((SECONDS % 60)) "${reason:+: $reason}" >&2
  case $status in
    ready) exit 0 ;;
    error) echo "prepare.sh: Cloudflare could not prepare $image" >&2 && exit 1 ;;
  esac
  # A refused request (bad image, token or account) won't change on its own;
  # rate limits, server errors and lost connections might.
  if [[ $code == 4* && $code != 429 ]]; then
    echo "prepare.sh: the request was refused" >&2
    exit 1
  fi
  if ((SECONDS + interval > deadline)); then
    echo "prepare.sh: $image is still not ready; run the deploy again to keep waiting" >&2
    exit 1
  fi
  sleep "$interval"
  interval=$((interval * 2 > 120 ? 120 : interval * 2))
done
