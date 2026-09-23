#!/usr/bin/env bash
# CI only. Installs from a local copy of the release twice, the way an update
# would, and checks that nothing the user owns is lost. Then feeds it a
# tampered zip and checks that the installed app survives.
# usage: install-check.sh <dist-dir>
set -euo pipefail

DIST="$(cd "$1" && pwd)"
PORT=8765
URL="http://127.0.0.1:$PORT"
python3 -m http.server "$PORT" --directory "$DIST" >/dev/null 2>&1 &
SERVER=$!
# pwd -P: /var is a symlink on macOS, and node reports the resolved path.
TMP="$(cd "$(mktemp -d)" && pwd -P)"
trap 'kill $SERVER; rm -rf "$TMP"' EXIT
for _ in $(seq 1 40); do curl -fs "$URL/SHA256SUMS" >/dev/null && break; sleep 0.25; done

export GWS_CONNECT_RELEASE_URL="$URL"
export GWS_CONNECT_HOME="$TMP/home"
export CLAUDE_CONFIG_DIR="$TMP/claude"
L="$GWS_CONNECT_HOME/gws-connect"

echo "--- first install"
bash "$DIST/install.sh"
"$L" list --lang en
"$GWS_CONNECT_HOME/app/runtime/gws/gws" --version
test -f "$CLAUDE_CONFIG_DIR/skills/gws-konten/SKILL.md"

echo "--- update with an account present"
mkdir -p "$GWS_CONNECT_HOME/accounts/anna-a-de"
printf '{"email":"anna@a.de","credSet":"default","services":["gmail"],"accountType":"workspace","connectedAt":"2026-09-01T00:00:00.000Z"}\n' \
  > "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json"
cp "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json" "$TMP/meta.before"
bash "$DIST/install.sh"
cmp "$TMP/meta.before" "$GWS_CONNECT_HOME/accounts/anna-a-de/meta.json"
grep -q "$GWS_CONNECT_HOME/app/runtime/node/bin/node" "$GWS_CONNECT_HOME/bin/gws-anna-a-de"

echo "--- tampered zip is refused and the app survives"
touch "$GWS_CONNECT_HOME/app/.marker"
mkdir "$TMP/bad"
cp "$DIST"/* "$TMP/bad/"
for z in "$TMP"/bad/*.zip; do printf 'x' >> "$z"; done
python3 -m http.server $((PORT + 1)) --directory "$TMP/bad" >/dev/null 2>&1 &
BAD=$!
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$((PORT + 1))/SHA256SUMS" >/dev/null && break; sleep 0.25; done
if GWS_CONNECT_RELEASE_URL="http://127.0.0.1:$((PORT + 1))" bash "$DIST/install.sh"; then
  kill $BAD; echo "a tampered zip must be refused"; exit 1
fi
kill $BAD
test -f "$GWS_CONNECT_HOME/app/.marker"

echo "install-check ok"
