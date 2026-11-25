#!/usr/bin/env bash
# Usage: ./compare.sh [part]   Runs the scenarios on main (broken) and fix, then writes results/comparison.md.
set -euo pipefail
cd "$(dirname "$0")"
for ref in main fix; do
  ./use-smithy.sh "$ref"
  ./run.sh "${1:-all}"
done
node scripts/compare.mjs
