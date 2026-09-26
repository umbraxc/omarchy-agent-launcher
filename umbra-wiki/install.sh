#!/bin/bash

# Install Umbra Wiki for the current user from this folder: launcher, app
# menu entry, icon, background service and config. No sudo; safe to re-run
# (for example after the plugin updates).
#
#   install.sh [--model <ollama-model>] [--library <dir>]

set -euo pipefail

app=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
config_dir=${XDG_CONFIG_HOME:-$HOME/.config}/umbra-wiki
model="" library=""
while (($#)); do
  case "$1" in
  --model) model=$2; shift 2 ;;
  --library) library=$2; shift 2 ;;
  *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

chmod +x "$app/umbra-wiki" "$app/server.py" "$app/fetch-archive.sh"
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications" \
  "$HOME/.local/share/icons/hicolor/scalable/apps" "$HOME/.config/systemd/user" "$config_dir"

ln -sf "$app/umbra-wiki" "$HOME/.local/bin/umbra-wiki"
cp "$app/ui/logo.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/org.umbra.wiki.svg"
gtk-update-icon-cache -q -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

cat >"$HOME/.local/share/applications/org.umbra.wiki.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Umbra Wiki
GenericName=Offline Survival Assistant
Comment=Ask questions answered from your offline survival library
Exec=umbra-wiki
Icon=org.umbra.wiki
Terminal=false
Categories=Education;Utility;
Keywords=survival;offline;wiki;ai;umbra;
StartupWMClass=org.umbra.wiki
DESKTOP

cat >"$HOME/.config/systemd/user/umbra-wiki.service" <<UNIT
[Unit]
Description=Umbra Wiki backend (offline library search + local AI)
After=network.target

[Service]
ExecStart=/usr/bin/python3 $app/server.py
Restart=on-failure

[Install]
WantedBy=default.target
UNIT

# Merge the given model and library into the config, keeping other keys.
python3 - "$config_dir/config.json" "$model" "$library" <<'PY'
import json, os, sys
path, model, library = sys.argv[1:4]
try:
    config = json.load(open(path))
except (OSError, ValueError):
    config = {}
if model:
    config["model"] = model
if library:
    config["libraryDir"] = os.path.expanduser(library)
config.setdefault("model", "gemma3:4b")
config.setdefault("libraryDir", os.path.expanduser("~/UmbraWiki/library"))
os.makedirs(config["libraryDir"], exist_ok=True)
json.dump(config, open(path, "w"), indent=2)
print(f"Umbra Wiki: model {config['model']}, library {config['libraryDir']}")
PY

systemctl --user daemon-reload
systemctl --user restart umbra-wiki 2>/dev/null || true
echo "Umbra Wiki installed. Open it from the app launcher or run: umbra-wiki"
