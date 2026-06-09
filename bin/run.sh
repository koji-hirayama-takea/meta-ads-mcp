#!/usr/bin/env bash
# MCP stdio entrypoint. Called by Claude Code from .mcp.json.
# Resolves to the repo root regardless of how invoked.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

cd "$PROJECT_DIR"

# Ensure deps are installed (idempotent — npm ci skipped if node_modules fresh).
if [ ! -d "node_modules" ]; then
  echo "[meta-ads-mcp] installing dependencies..." >&2
  npm install --silent
fi

exec npx --no-install tsx src/index.ts
