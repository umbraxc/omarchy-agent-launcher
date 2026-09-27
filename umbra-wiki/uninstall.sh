#!/bin/bash

# Remove Umbra Wiki from this computer: its background service, launcher,
# app-menu entry, icon, settings, profile and conversations.
#   uninstall.sh [--library] [--model]
#   --library  also delete the offline library's collections (only the
#              catalog's .zim files; anything else in that folder stays)
#   --model    also delete the AI model Umbra was using (ollama rm)
# Ollama and other system packages stay: other programs may use them. The
# Omarchy Umbra bar widget stays too and offers to set Umbra up again.

set -u

app=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
config_dir=${XDG_CONFIG_HOME:-$HOME/.config}/umbra-wiki
data_dir=${XDG_DATA_HOME:-$HOME/.local/share}/umbra-wiki
library=$(jq -r '.libraryDir // empty' "$config_dir/config.json" 2>/dev/null)
library=${library:-$HOME/UmbraWiki/library}
library=${library/#\~/$HOME}
model=$(jq -r '.model // empty' "$config_dir/config.json" 2>/dev/null)

remove_library=false remove_model=false
for arg in "$@"; do
  case $arg in
  --library) remove_library=true ;;
  --model) remove_model=true ;;
  *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

# Close Umbra's windows, downloads and backend.
pkill -f "(bin|umbra-wiki)/umbra-wiki( |$)" 2>/dev/null   # launched via ~/.local/bin or directly
systemctl --user stop 'umbra-wiki-download-*' 2>/dev/null
systemctl --user disable --now umbra-wiki 2>/dev/null
# A package install (the AUR's umbra-wiki, under /usr) keeps its program
# files: pacman removes those. Otherwise remove what install.sh set up.
packaged=false
[[ $app == /usr/* ]] && packaged=true
if ! $packaged; then
  rm -f "$HOME/.config/systemd/user/umbra-wiki.service"
  rm -f "$HOME/.local/bin/umbra-wiki" \
    "$HOME/.local/share/applications/org.umbra.wiki.desktop" \
    "$HOME/.local/share/icons/hicolor/scalable/apps/org.umbra.wiki.svg"
  gtk-update-icon-cache -q -t "$HOME/.local/share/icons/hicolor" 2>/dev/null
fi
systemctl --user daemon-reload
rm -f "${XDG_RUNTIME_DIR:-/tmp}/umbra-wiki-attention"

if $remove_library && [[ -d $library ]]; then
  while read -r file; do
    rm -f "$library/$file" "$library/$file.part"
  done < <(jq -r '.[].file' "$app/library.json")
  rmdir "$library" 2>/dev/null   # only if nothing else is in it
fi

if $remove_model && [[ -n $model ]] && command -v ollama &>/dev/null; then
  ollama rm "$model" >/dev/null 2>&1
fi

rm -rf "$config_dir" "$data_dir"

if $packaged; then
  command -v notify-send &>/dev/null &&
    notify-send -a "Umbra Wiki" "Your Umbra data was removed" "To remove the app itself: sudo pacman -R umbra-wiki"
  echo "Your Umbra data was removed. To remove the app itself: sudo pacman -R umbra-wiki"
else
  command -v notify-send &>/dev/null &&
    notify-send -a "Umbra Wiki" "Umbra Wiki was uninstalled" "Set it up again any time from the Omarchy Umbra widget."
  echo "Umbra Wiki uninstalled."
fi
