#!/usr/bin/env bash
# Usage: ./run.sh [A|B|C|D|all]   Runs scenarios against the smithy activated by ./use-smithy.sh.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .smithy/active.json ] || { echo "No active smithy. Run ./use-smithy.sh main|fix first." >&2; exit 1; }
[ -f node_modules/@smithy/core/.smithy-ref.json ] || { echo "node_modules/@smithy/core is not a fork build (npm reinstalled?). Re-run ./use-smithy.sh." >&2; exit 1; }
echo "Active smithy: $(cat node_modules/@smithy/core/.smithy-ref.json)"
node scripts/build.mjs
node scripts/run.mjs "${1:-all}"
