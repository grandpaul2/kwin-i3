#!/usr/bin/env bash
# Concatenate src/ into the one file KWin loads. Order matters: definitions first, main.js last.
# Each file starts with a marker so a line number in KWin's error output can be mapped back:
#   grep -n '^// ---- src/' package/contents/code/main.js
set -euo pipefail
cd "$(dirname "$0")"
files=(src/log.js src/settings.js src/tree.js src/rules.js src/workspaces.js src/outputs.js src/placement.js src/keyname.js src/kwin.js src/main.js)
out=package/contents/code/main.js
tmp=$(mktemp)
{
    echo "// Built by build.sh from src/ — do not edit; edit src/ and rebuild."
    for f in "${files[@]}"; do
        echo "// ---- $f"
        cat "$f"
    done
} > "$tmp"
mv "$tmp" "$out"
# Every src/ file must be in the list, or it is silently left out of the build.
for f in src/*.js; do
    [[ " ${files[*]} " == *" $f "* ]] || { echo "build.sh: $f is not in the files list" >&2; exit 1; }
done
node --check "$out"
