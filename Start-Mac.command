#!/usr/bin/env bash
# Double-click starter for macOS. If Gatekeeper complains the first time:
# right-click -> Open -> Open. Only on the first run.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt / Node.js is missing."
  echo "Bitte die LTS-Version installieren / please install the LTS version:"
  echo "  https://nodejs.org"
  echo
  read -r -p "Enter zum Beenden / Enter to quit "
  exit 1
fi

node ./bin/gws-connect.mjs "$@"
status=$?
echo
read -r -p "Enter zum Beenden / Enter to quit "
exit $status
