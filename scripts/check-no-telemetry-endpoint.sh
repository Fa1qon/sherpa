#!/usr/bin/env bash
# T-L6-E AC-3 / NF17 — verify no telemetry endpoint pattern in source.
#
# Local-first guarantee: the bundled app must not phone home to any
# 3rd-party analytics SaaS or expose a generic telemetry/tracking URL.
# NF17 mandates manual opt-in only; this script asserts the negative.
#
# Two complementary checks:
#   1. SaaS vendor names — posthog / mixpanel / segment.io / sentry.io /
#      analytics.google.com / amplitude.
#   2. Generic endpoint patterns — `/v1/(track|event|telemetry|analytics)`
#      style URLs, regardless of host.
#
# Comments, README files, and test fixtures are filtered out so that
# documentation can legitimately mention the names ("we don't ship telemetry
# — no posthog / mixpanel / etc").
#
# Exit codes:
#   0 — clean
#   1 — at least one offender found (CI fails)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[check-no-telemetry-endpoint] scope: src/core src/main src/renderer src/presentation"

# 1. SaaS vendor names
vendor_re='(posthog|mixpanel|segment\.io|analytics\.google\.com|sentry\.io|amplitude\.com)'
vendor_hits=$(grep -rEn "$vendor_re" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
  src/core src/main src/renderer src/presentation 2>/dev/null \
  | grep -v -E ':\s*//' \
  | grep -v -E ':\s*\*' \
  | grep -v -E '\.spec\.|\.test\.|README|fixtures/' \
  || true)

if [ -n "$vendor_hits" ]; then
  echo "ERROR (NF17): telemetry SaaS vendor reference found in source:"
  echo "$vendor_hits"
  exit 1
fi

# 2. Generic telemetry endpoint URL patterns
generic_re='/v1/(track|event|telemetry|analytics)'
generic_hits=$(grep -rEn "$generic_re" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
  src/core src/main src/renderer src/presentation 2>/dev/null \
  | grep -v -E ':\s*//' \
  | grep -v -E ':\s*\*' \
  | grep -v -E '\.spec\.|\.test\.|README|fixtures/' \
  || true)

if [ -n "$generic_hits" ]; then
  echo "ERROR (NF17): generic telemetry endpoint pattern found in source:"
  echo "$generic_hits"
  exit 1
fi

echo "OK: no telemetry endpoint in source (NF17)"
