#!/usr/bin/env bash
# Usage: ./use-smithy.sh main|fix|<any git ref>
# Builds @smithy/core from the fork at <ref> and installs it over node_modules/@smithy/core.
set -euo pipefail
cd "$(dirname "$0")"

FORK_URL="${SMITHY_FORK_URL:-https://github.com/cadivus/smithy-typescript.git}"
REF="${1:?usage: ./use-smithy.sh main|fix|<ref>}"
case "$REF" in
  fix) GIT_REF="wasm/aws-chunked-browser-bytes" ;;
  *) GIT_REF="$REF" ;;
esac
SRC=.smithy/smithy-typescript

[ -d "$SRC/.git" ] || git clone --quiet "$FORK_URL" "$SRC"
git -C "$SRC" fetch --quiet origin
if git -C "$SRC" rev-parse --verify --quiet "origin/$GIT_REF^{commit}" >/dev/null; then
  git -C "$SRC" checkout --quiet --detach "origin/$GIT_REF"
else
  git -C "$SRC" checkout --quiet --detach "$GIT_REF"
fi
SHA=$(git -C "$SRC" rev-parse HEAD)

echo "Building @smithy/core at $GIT_REF ($SHA)"
(cd "$SRC" && corepack yarn install --immutable >/dev/null)
(cd "$SRC/packages/core" && node ../../scripts/compilation/es_cjs.js >/dev/null)

[ -d node_modules ] || npm ci --no-audit --no-fund
rm -rf .smithy/pack && mkdir -p .smithy/pack
TGZ=$(cd "$SRC/packages/core" && npm pack --ignore-scripts --silent --pack-destination "$OLDPWD/.smithy/pack")
tar -xzf ".smithy/pack/$TGZ" -C .smithy/pack

for dir in $(find node_modules -path '*/@smithy/core/package.json' -exec dirname {} \;); do
  rm -rf "$dir/dist-es" "$dir/dist-cjs"
  cp -R .smithy/pack/package/. "$dir/"
  printf '{"ref":"%s","sha":"%s"}\n' "$REF" "$SHA" > "$dir/.smithy-ref.json"
  echo "Installed into $dir"
done
printf '{"ref":"%s","sha":"%s"}\n' "$REF" "$SHA" > .smithy/active.json
echo "Active smithy: $REF ($GIT_REF) @ $SHA"
