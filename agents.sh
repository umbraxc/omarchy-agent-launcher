#!/bin/bash

# Backend for the Omarchy Umbra bar widget.
#
#   agents.sh status        One JSON line per entry, in two sections:
#                             local:  Umbra Wiki, or "Set up Umbra Wiki"
#                             online: installed coding agents (Claude, Codex…)
#                           {"id","name","section","running","isDefault","detail","setup"}
#   agents.sh launch <id>   Open a coding agent, Umbra Wiki, or the setup.
#   agents.sh themes        Umbra Wiki themes and the current one, as JSON.
#   agents.sh theme <id>    Switch the Umbra Wiki theme.
#   agents.sh loadout       The current Umbra Wiki loadout, as JSON.
#   agents.sh fact          This hour's survival field note, as JSON.
#   agents.sh ask <text>    Open Umbra Wiki and ask it a question.
#   agents.sh setup-local   Guided install of Umbra Wiki (run by the widget).

known_agents=(claude codex opencode gemini cursor-agent copilot crush grok pi omp hermes muse)
script=$(readlink -f "${BASH_SOURCE[0]}")
here=$(dirname "$script")
umbra_dir="$here/umbra-wiki"
umbra_config=${XDG_CONFIG_HOME:-$HOME/.config}/umbra-wiki

agent_name() {
  case "$1" in
  claude) echo "Claude Code" ;;
  codex) echo "Codex" ;;
  opencode) echo "OpenCode" ;;
  gemini) echo "Gemini" ;;
  cursor-agent) echo "Cursor CLI" ;;
  copilot) echo "GitHub Copilot" ;;
  crush) echo "Crush" ;;
  grok) echo "Grok" ;;
  pi) echo "Pi" ;;
  omp) echo "Oh My Pi" ;;
  hermes) echo "Hermes" ;;
  muse) echo "Muse Code" ;;
  *) echo "$1" ;;
  esac
}

# Omarchy puts install-on-first-run stubs in ~/.local/bin for every agent it
# offers. A real install lands earlier on PATH (mise), so if PATH still
# resolves to a stub the agent isn't installed. Asking mise directly is
# correct too, but takes seconds per agent — too slow for a bar poll.
installed() {
  local path shebang
  path=$(command -v "$1") || return 1
  # Stubs are scripts; skip grepping multi-hundred-MB native binaries.
  read -r -n 2 shebang <"$path" 2>/dev/null
  [[ $shebang == "#!" ]] || return 0
  grep -qs '^mise use -g' "$path" && return 1
  if grep -qs '^# Written by omarchy-install-' "$path"; then
    compgen -G "$HOME/.local/share/mise/installs/*$1*" >/dev/null
    return
  fi
  return 0
}

# Sessions of a program: processes whose executable is the program, or a
# script runtime (node, bun, python) whose script is. Terminal wrappers such
# as `foot -e claude` don't count, so each session is counted once.
count_sessions() {
  awk -v a="$1" '{
    b = $1; sub(".*/", "", b)
    c = $2; sub(".*/", "", c)
    if (b == a || (b ~ /^(node|bun|python3?)$/ && c == a)) n++
  } END { print n + 0 }' <<<"$procs"
}

entry() { # id name section running isDefault detail setup
  jq -nc --arg id "$1" --arg name "$2" --arg section "$3" --argjson running "$4" \
    --argjson isDefault "$5" --arg detail "$6" --argjson setup "$7" \
    '{id: $id, name: $name, section: $section, running: $running, isDefault: $isDefault, detail: $detail, setup: $setup}'
}

pretty_model() { # gemma3:4b -> Gemma3 4B
  local name=${1%%:*} tag=${1#*:}
  [[ $tag == "$1" || $tag == latest ]] && tag="" || tag=" ${tag^^}"
  echo "${name^}$tag"
}

status() {
  local default agent running is_default model
  procs=$(ps -eo args --no-headers)

  # LOCAL is always Umbra Wiki: installed, or offered for setup.
  if command -v umbra-wiki &>/dev/null; then
    model=$(jq -r '.model // "gemma3:4b"' "$umbra_config/config.json" 2>/dev/null)
    running=$(count_sessions umbra-wiki)
    entry umbra-wiki "Umbra Wiki" local "$running" false "$(pretty_model "${model:-gemma3:4b}") · offline" false
  else
    entry setup-local "Set up Umbra Wiki" local 0 false "Offline survival AI · guided install" true
  fi

  default=$(omarchy-default-agent 2>/dev/null)
  for agent in "${known_agents[@]}"; do
    installed "$agent" || continue
    running=$(count_sessions "$agent")
    [[ $agent == "$default" ]] && is_default=true || is_default=false
    entry "$agent" "$(agent_name "$agent")" online "$running" "$is_default" "" false
  done
}

themes() {
  local current auto
  current=$(jq -r '.theme // "umbra"' "$umbra_config/settings.json" 2>/dev/null)
  # The automatic theme is computed by the Umbra Wiki backend from the
  # current Omarchy theme; it is offered only while the backend runs.
  auto=$(curl -s --max-time 1 http://127.0.0.1:8766/api/omarchy-theme 2>/dev/null)
  jq -c <<<"$auto" '.' &>/dev/null && [[ $(jq -r '.id // empty' <<<"$auto") == auto ]] || auto='null'
  local custom='[]'
  [[ -f $umbra_config/themes.json ]] && jq -e 'type == "array"' "$umbra_config/themes.json" &>/dev/null &&
    custom=$(jq -c . "$umbra_config/themes.json")
  jq -c --arg current "${current:-umbra}" --argjson auto "$auto" --argjson custom "$custom" \
    '{current: $current,
      themes: ((if $auto then [$auto] else [] end) + . + $custom) | map({id, name, signal, fg, bg: .bg1})}' \
    "$umbra_dir/ui/themes.json"
}

loadout() {
  local settings='{}' custom='[]' scenarios='[]'
  [[ -f $umbra_config/settings.json ]] && settings=$(cat "$umbra_config/settings.json")
  [[ -f $umbra_config/personalities.json ]] && custom=$(cat "$umbra_config/personalities.json")
  [[ -f $umbra_config/scenarios.json ]] && scenarios=$(cat "$umbra_config/scenarios.json")
  jq -c --argjson s "$settings" --argjson custom "$custom" --argjson scenarios "$scenarios" '
    (first((.scenarios + $scenarios)[] | select(.id == ($s.scenario // "everyday"))) // .scenarios[0]) as $sc
    | ((.personalities + $custom)[] | select(.id == ($s.personality // "umbra"))) as $pe
    | {scenario: $sc.name, personality: $pe.name,
       face: ($pe.art // .personalities[($pe.face // 0)].art)[0]}' \
    "$umbra_dir/ui/loadout.json" 2>/dev/null || echo '{}'
}

# A new field note every hour, cycling through the whole list in a
# shuffled but stable order so neighbouring hours aren't similar.
fact() {
  local facts="$umbra_dir/facts.json" hour
  [[ -f $facts ]] || { echo '{}'; return; }
  hour=$(( $(date +%s) / 3600 ))
  jq -c --argjson hour "$hour" \
    'length as $n | {text: .[(($hour * 37) % $n)], index: (($hour * 37) % $n), total: $n}' "$facts"
}

set_theme() {
  local id=${1:?theme needs an id}
  themes | jq -e --arg id "$id" 'any(.themes[]; .id == $id)' >/dev/null || exit 1
  mkdir -p "$umbra_config"
  local file="$umbra_config/settings.json" current='{}'
  [[ -f $file ]] && current=$(cat "$file")
  jq --arg id "$id" '.theme = $id' <<<"$current" >"$file.tmp" && mv "$file.tmp" "$file"
}

launch() {
  local agent=${1:?launch needs an agent id}
  local command

  # Same flags `omarchy agent` uses, so sessions behave identically whichever
  # way they are opened.
  case "$agent" in
  claude) command=(claude --permission-mode auto) ;;
  codex) command=(codex --approve-for-me) ;;
  opencode) command=(opencode --auto) ;;
  gemini) command=(gemini --yolo) ;;
  cursor-agent) command=(cursor-agent --yolo --trust) ;;
  copilot) command=(copilot --allow-all) ;;
  crush) command=(crush --yolo) ;;
  grok) command=(grok --permission-mode bypassPermissions) ;;
  pi) command=(pi) ;;
  omp) command=(omp --auto-approve) ;;
  hermes) command=(hermes --yolo) ;;
  muse) command=(muse --approval-mode never) ;;
  umbra-wiki)
    exec setsid uwsm-app -- umbra-wiki
    ;;
  setup-local)
    exec omarchy-launch-floating-terminal-with-presentation "$script" setup-local
    ;;
  *)
    echo "Unknown agent: $agent" >&2
    exit 1
    ;;
  esac

  # Agents refuse to remember trust for $HOME, so start in ~/Work like
  # `omarchy agent` does.
  cd "$HOME"
  [[ -d $HOME/Work ]] && cd "$HOME/Work"

  exec omarchy-launch-tui --app-id=org.omarchy.agent "${command[@]}"
}

# Interactive: runs in a floating terminal opened from the widget.
setup_local() {
  cat <<'INTRO'

  SET UP UMBRA WIKI

  Umbra Wiki is an offline survival assistant: a local AI that answers
  from a library stored on this computer, and keeps working without
  internet. Nothing you ask leaves this machine.

  Steps:  1. install Ollama and a few system packages (needs your password)
          2. install the Umbra Wiki app
          3. voice input: hold F9 to talk (offline, optional)
          4. open Umbra: its welcome tour helps you pick the AI model
             and the offline library that suit this computer

INTRO
  gum confirm "Continue?" || exit 130

  # Use the graphics card for the AI when it has a supported one.
  local gpu_pkg=""
  if lspci 2>/dev/null | grep -iE "vga|3d|display" | grep -qi nvidia && nvidia-smi &>/dev/null; then
    gpu_pkg=ollama-cuda
    echo "NVIDIA graphics found: the AI will run on the graphics card (CUDA)."
  elif lspci 2>/dev/null | grep -iE "vga|3d|display" | grep -qiE "amd|radeon|advanced micro"; then
    gpu_pkg=ollama-rocm
    echo "AMD graphics found: the AI will run on the graphics card (ROCm)."
  else
    echo "No supported graphics card: the AI will run on the processor."
  fi

  # Umbra draws everything in JetBrains Mono Nerd Font. Omarchy ships a
  # variant of it that conflicts with the full package, so only add the
  # font when none is installed.
  local font_pkg=""
  fc-list 2>/dev/null | grep -qi "JetBrainsMono Nerd" || font_pkg=ttf-jetbrains-mono-nerd

  echo "Installing packages…"
  omarchy-pkg-add ollama $gpu_pkg python-gobject webkit2gtk-4.1 gst-plugins-good kiwix-tools jq curl \
    pciutils pipewire-audio xdg-utils libnotify gtk-update-icon-cache $font_pkg ||
    { echo "Could not install the packages."; exit 1; }
  echo "Starting the Ollama service…"
  sudo systemctl enable --now ollama || { echo "Could not start the Ollama service."; exit 1; }
  [[ -n $gpu_pkg ]] && sudo systemctl restart ollama
  for _ in $(seq 30); do curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done

  bash "$umbra_dir/install.sh" --library "$HOME/UmbraWiki/library" || exit 1

  # Voice input: Omarchy's own voxtype installer asks first, downloads the
  # offline English speech model and binds F9 (hold to talk) everywhere.
  echo
  if command -v voxtype &>/dev/null; then
    echo "Voice input is already set up: hold F9 to talk."
  elif command -v omarchy-voxtype-install &>/dev/null; then
    echo "Voice input lets you talk to Umbra instead of typing (hold F9)."
    omarchy-voxtype-install || echo "Skipped. Install later with: omarchy-voxtype-install"
  fi

  echo
  echo "Umbra Wiki is installed. Opening it now: the welcome tour takes it from here."
  setsid uwsm-app -- umbra-wiki >/dev/null 2>&1 &
  sleep 2
}

case "${1:-}" in
status) status ;;
launch) launch "${2:-}" ;;
themes) themes ;;
fact) fact ;;
loadout) loadout ;;
open-loadout) exec setsid uwsm-app -- umbra-wiki --loadout ;;
ask) exec setsid uwsm-app -- umbra-wiki "${2:-}" ;;
theme) set_theme "${2:-}" ;;
setup-local) setup_local ;;
*)
  echo "Usage: agents.sh status | launch <id> | themes | theme <id> | loadout | open-loadout | fact | ask <text> | setup-local" >&2
  exit 1
  ;;
esac
