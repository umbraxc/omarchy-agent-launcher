#!/bin/bash

# Umbra Wiki on plain Arch Linux (no Omarchy needed).
#
#   git clone https://github.com/umbraxc/omarchy-umbra.git ~/.local/share/omarchy-umbra
#   ~/.local/share/omarchy-umbra/install-arch.sh
#
# Installs the system packages Umbra needs, starts Ollama (the local AI),
# installs the Umbra Wiki app, optionally adds voice input, and opens it:
# the welcome tour then helps you pick the AI model and the offline library.
# Keep the cloned folder: Umbra runs from it.
#
#   install-arch.sh --update   Reinstall the app after updating the folder
#                              yourself (git -C <folder> pull); the installer
#                              never downloads code on its own.
#
# UMBRA_DRY_RUN=1 prints what would be installed without changing anything.

set -euo pipefail

here=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
app="$here/umbra-wiki"
dry=${UMBRA_DRY_RUN:-}

run() {
  if [[ -n $dry ]]; then echo "  [dry run] $*"; else "$@"; fi
}
ask() { # question default(y/n) → 0 for yes
  local answer
  read -rp "$1 " answer || answer=""
  answer=${answer:-$2}
  [[ ${answer,,} == y* ]]
}

if ((EUID == 0)); then
  echo "Run this as your normal user; it asks for your password when it needs it."
  exit 1
fi
if ! command -v pacman &>/dev/null; then
  echo "This installer is for Arch Linux (it uses pacman)."
  exit 1
fi
if [[ ! -f $app/install.sh ]]; then
  echo "Umbra Wiki's files weren't found next to this script ($app)."
  exit 1
fi

if [[ ${1:-} == --update ]]; then
  run bash "$app/install.sh"
  echo "Umbra Wiki reinstalled from $here."
  exit 0
fi

cat <<'INTRO'

  UMBRA WIKI FOR ARCH LINUX

  An offline survival assistant: a local AI that answers from a library
  stored on this computer and keeps working without internet. Nothing you
  ask leaves this machine.

  Steps:  1. install Ollama and a few system packages (asks for your password)
          2. install the Umbra Wiki app (menu entry, background service)
          3. voice input: talk instead of typing (optional)
          4. open Umbra: its welcome tour helps you pick the AI model and
             the offline library that suit this computer

INTRO
ask "Continue? [Y/n]" y || exit 130

packages=(ollama python-gobject python-cairo webkit2gtk-4.1 gst-plugins-good kiwix-tools poppler jq curl
  pciutils pipewire-audio xdg-utils xdg-user-dirs libnotify gtk-update-icon-cache)

# Use the graphics card for the AI when it has a supported one.
gpu_pkg=""
if lspci 2>/dev/null | grep -iE "vga|3d|display" | grep -i nvidia >/dev/null && nvidia-smi &>/dev/null; then
  gpu_pkg=ollama-cuda
  echo "NVIDIA graphics found: the AI will run on the graphics card (CUDA)."
elif lspci 2>/dev/null | grep -iE "vga|3d|display" | grep -iE "amd|radeon|advanced micro" >/dev/null; then
  gpu_pkg=ollama-rocm
  echo "AMD graphics found: the AI will run on the graphics card (ROCm)."
else
  echo "No supported graphics card found: the AI will run on the processor."
fi
[[ -n $gpu_pkg ]] && packages+=("$gpu_pkg")

# Umbra draws everything in JetBrains Mono Nerd Font; any variant will do.
fc-list 2>/dev/null | grep -i "JetBrainsMono Nerd" >/dev/null || packages+=(ttf-jetbrains-mono-nerd)   # no -q: it would cut the pipe short

echo
echo "Installing packages…"
run sudo pacman -S --needed "${packages[@]}"

echo "Starting the Ollama service…"
run sudo systemctl enable --now ollama
[[ -n $gpu_pkg ]] && run sudo systemctl restart ollama
if [[ -z $dry ]]; then
  for _ in $(seq 30); do curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done
fi

echo
run bash "$app/install.sh" --library "$HOME/UmbraWiki/library"

# Voice input uses voxtype, which is in the AUR. Umbra records the
# microphone itself and uses voxtype's offline English speech model; hold
# F9 in the Umbra window (or click the microphone) to talk.
echo
if command -v voxtype &>/dev/null; then
  echo "Voice input is already set up: hold F9 in Umbra to talk."
elif ask "Add voice input (offline English speech model, about 0.2 GB)? [y/N]" n; then
  helper=$(command -v paru || command -v yay || true)
  if [[ -n $helper ]]; then
    run "$helper" -S --needed voxtype-bin
    run voxtype setup --download --model base.en --quiet
    echo "Voice input is ready: hold F9 in Umbra to talk."
  else
    echo "Voice input needs voxtype from the AUR. With an AUR helper (for example yay):"
    echo "  yay -S voxtype-bin && voxtype setup --download --model base.en"
  fi
fi

echo
echo "Umbra Wiki is installed. Open it from your app launcher, or run: umbra-wiki"
if [[ -z $dry ]] && ask "Open Umbra Wiki now? [Y/n]" y; then
  setsid umbra-wiki >/dev/null 2>&1 &
fi
