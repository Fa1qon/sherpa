#!/usr/bin/env bash
# T-L6-E AC-5 / NF19 — i18n parity check (shell wrapper).
#
# Thin wrapper around `scripts/check-i18n-parity.mjs`. The Node script is
# the canonical implementation (cross-platform JSON parsing). This wrapper
# exists only to satisfy the T-L6-E `creates:` contract that lists a `.sh`
# file by name; CI on Windows uses the .mjs directly.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/check-i18n-parity.mjs"
