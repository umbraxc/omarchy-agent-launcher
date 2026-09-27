#!/bin/bash

# Download one library collection for Umbra Wiki, verify it and reload.
#   fetch-archive.sh <collection-id> [<collection-id>...]
# Downloads resume if interrupted; nothing is kept unless its SHA-256
# matches the catalog.

set -uo pipefail

app=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
config=${XDG_CONFIG_HOME:-$HOME/.config}/umbra-wiki/config.json
library=$(jq -r '.libraryDir // empty' "$config" 2>/dev/null)
library=${library:-$HOME/UmbraWiki/library}
library=${library/#\~/$HOME}
mkdir -p "$library"

status=0
for id in "$@"; do
  entry=$(jq -c --arg id "$id" '.[] | select(.id == $id)' "$app/library.json")
  if [[ -z $entry ]]; then
    echo "Unknown collection: $id"
    status=1
    continue
  fi
  name=$(jq -r .name <<<"$entry")
  file=$(jq -r .file <<<"$entry")
  url=$(jq -r .url <<<"$entry")
  sha=$(jq -r .sha256 <<<"$entry")
  size=$(jq -r '.size / 1e6 | floor' <<<"$entry")

  if [[ -f $library/$file ]]; then
    echo "✓ $name is already installed."
    continue
  fi

  echo
  echo "Downloading $name (${size} MB)…"
  if ! curl -fL -C - --retry 5 --retry-delay 3 --progress-bar -o "$library/$file.part" "$url"; then
    echo "✗ Download failed. Run this again to resume."
    status=1
    continue
  fi
  echo "Verifying…"
  if [[ $(sha256sum "$library/$file.part" | cut -d' ' -f1) != "$sha" ]]; then
    echo "✗ Checksum mismatch; the file was damaged in transit and has been removed."
    rm -f "$library/$file.part"
    status=1
    continue
  fi
  mv "$library/$file.part" "$library/$file"
  echo "✓ $name installed."
done

# kiwix-serve reads the library at start: ask the backend to reload it (only
# the library server restarts, answers in progress carry on).
if curl -fs -m 20 -X POST "http://127.0.0.1:${UMBRA_PORT:-8766}/api/reload-library" >/dev/null 2>&1; then
  echo "Umbra Wiki reloaded with the new library."
elif systemctl --user is-active --quiet umbra-wiki; then
  systemctl --user restart umbra-wiki
  echo "Umbra Wiki reloaded with the new library."
fi
exit $status
