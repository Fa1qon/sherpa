#!/usr/bin/env bash
# T-L6-E AC-2 / NF16 — verify the production bundle has no cloud-* adapter.
#
# Two complementary checks:
#   1. Directory check — no `src/core/adapters/cloud_*/` or `src/main/cloud_*/`
#      directory exists. Local-first architecture per ADR-001 + NF16: any
#      remote adapter would have to live behind an explicitly-marked path
#      that this script blocks.
#   2. Hostname check — no source file references a SaaS cloud hostname
#      (AWS / GCP / Azure / Cloudflare / OpenAI / Anthropic). Comments and
#      docstrings are filtered so README references / doc URLs don't trip
#      the gate.
#
# Exit codes:
#   0 — clean
#   1 — at least one offender found (CI fails)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[check-no-cloud-adapter] scope: src/core/adapters src/main"

# 1. Directory check
violators=$(find src/core/adapters src/main -type d -name 'cloud_*' 2>/dev/null || true)
if [ -n "$violators" ]; then
  echo "ERROR (NF16): cloud_* adapter directory exists:"
  echo "$violators"
  exit 1
fi

# 2. Hostname check. Restrict to .ts / .tsx / .js / .mjs / .cjs source.
#    Strip line/block comments before grepping so README refs in comments
#    do not trip the gate.
host_re='https?://[a-zA-Z0-9-]+\.(amazonaws|googleapis|azure|cloudflare|openai|anthropic)\.com'
hits=$(grep -rEn "$host_re" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' \
  src/core/adapters src/main 2>/dev/null \
  | grep -v -E ':\s*//' \
  | grep -v -E ':\s*\*' \
  | grep -v -E '\.spec\.|\.test\.|README' \
  || true)

if [ -n "$hits" ]; then
  echo "ERROR (NF16): cloud hostname found in production source:"
  echo "$hits"
  exit 1
fi

echo "OK: no cloud adapter in production bundle (NF16)"
