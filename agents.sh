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
  local current
  current=$(jq -r '.theme // "umbra"' "$umbra_config/settings.json" 2>/dev/null)
  jq -c --arg current "${current:-umbra}" \
    '{current: $current, themes: [.[] | {id, name, signal, fg, bg: .bg1}]}' "$umbra_dir/ui/themes.json"
}

set_theme() {
  local id=${1:?theme needs an id}
  jq -e --arg id "$id" 'any(.[]; .id == $id)' "$umbra_dir/ui/themes.json" >/dev/null || exit 1
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
          2. download an AI model of your choice (1–5 GB)
          3. download the Survival Essentials library (0.9 GB, optional)
          4. install the Umbra Wiki app

INTRO
  gum confirm "Continue?" || exit 130

  echo "Installing packages…"
  omarchy-pkg-add ollama python-gobject webkit2gtk-4.1 gst-plugins-good kiwix-tools jq curl ||
    { echo "Could not install the packages."; exit 1; }
  echo "Starting the Ollama service…"
  sudo systemctl enable --now ollama || { echo "Could not start the Ollama service."; exit 1; }
  for _ in $(seq 30); do curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done

  local choice model
  choice=$(gum choose --header "Pick the AI model (larger = smarter, but slower and needs more memory):" \
    "gemma3:4b    ~3.3 GB  recommended balance, 8 GB RAM or more" \
    "gemma3:1b    ~0.8 GB  fastest, basic answers, any computer" \
    "llama3.1:8b  ~4.9 GB  most capable, 16 GB RAM, slow without a GPU") || exit 130
  model=${choice%% *}
  echo
  echo "Downloading $model…"
  ollama pull "$model" || { echo "Download failed. Run: ollama pull $model"; exit 1; }

  local library="$HOME/UmbraWiki/library"
  bash "$umbra_dir/install.sh" --model "$model" --library "$library" || exit 1

  echo
  if gum confirm "Download the Survival Essentials library now? (0.9 GB: water, food, knots, field medicine, post-disaster guides)"; then
    # shellcheck disable=SC2046 # one argument per collection id
    bash "$umbra_dir/fetch-archive.sh" $(jq -r '.[] | select(.essential) | .id' "$umbra_dir/library.json")
  else
    echo "Skipped. Add collections any time from the Library button in Umbra Wiki."
  fi

  echo
  echo "Umbra Wiki is ready. It appears under LOCAL in Omarchy Umbra."
  if gum confirm "Open Umbra Wiki now?"; then
    setsid uwsm-app -- umbra-wiki >/dev/null 2>&1 &
  fi
}

case "${1:-}" in
status) status ;;
launch) launch "${2:-}" ;;
themes) themes ;;
theme) set_theme "${2:-}" ;;
setup-local) setup_local ;;
*)
  echo "Usage: agents.sh status | launch <id> | themes | theme <id> | setup-local" >&2
  exit 1
  ;;
esac
