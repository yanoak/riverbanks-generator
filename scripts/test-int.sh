#!/usr/bin/env bash
# Integration tests against the local Supabase stack (`supabase start` must be running).
set -euo pipefail
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"
SUPABASE_TEST_URL="$API_URL" SUPABASE_TEST_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" SUPABASE_TEST_SECRET_KEY="$SECRET_KEY" \
	npx vitest run --project server '.int.test.ts' "$@"
