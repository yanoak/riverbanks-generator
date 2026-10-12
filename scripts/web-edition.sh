#!/usr/bin/env bash
# Runs scripts/web-edition.ts with the app's $lib alias. Plan: 2026-10-12_web-edition-pdf.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
JITI_ALIAS="{\"\$lib\":\"$root/src/lib\"}" exec npx jiti scripts/web-edition.ts "$@"
