#!/bin/zsh
set -euo pipefail

if [[ "${NUANCES_SKIP_VERSION_POLICY_SYNC:-}" == "1" ]]; then
  echo "[sync-app-version-policy] skipped by NUANCES_SKIP_VERSION_POLICY_SYNC=1"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
XCODE_ENV="$PROJECT_ROOT/ios/.xcode.env"
XCODE_ENV_LOCAL="$PROJECT_ROOT/ios/.xcode.env.local"

if [[ -f "$XCODE_ENV" ]]; then
  source "$XCODE_ENV"
fi
if [[ -f "$XCODE_ENV_LOCAL" ]]; then
  source "$XCODE_ENV_LOCAL"
fi

NODE_BIN="${NODE_BINARY:-$(command -v node || true)}"
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "[sync-app-version-policy] Node not found. Set NODE_BINARY in ios/.xcode.env.local."
  exit 1
fi

cd "$PROJECT_ROOT"
"$NODE_BIN" scripts/sync-app-version-policy.js --source xcode-archive-post-action
