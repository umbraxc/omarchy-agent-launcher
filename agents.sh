#!/bin/bash

# Backend for the Omarchy Umbra Agent Tool bar widget.
#
#   agents.sh status [local-apps-json] [show-ollama]
#       One JSON line per entry, in two sections:
#         local:  custom local AI apps from the widget settings, installed
#                 Ollama models, or a "set up a local AI" entry when there
#                 are none; online: installed coding agents (Claude, Codex…).
#       {"id","name","section","running","isDefault","detail","setup"}
#   agents.sh launch <id>       New session of a coding agent or Ollama model.
#   agents.sh launch-app <cmd>  Start a custom local app.
#   agents.sh setup-local       Guided install of Ollama and a model.

known_agents=(claude codex opencode gemini cursor-agent copilot crush grok pi omp hermes muse)
script=$(readlink -f "${BASH_SOURCE[0]}")

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
  local local_apps=${1:-[]} show_ollama=${2:-true}
  local default agent running is_default locals=0
  procs=$(ps -eo args --no-headers)

  # Custom local apps, e.g. {"id":"umbra-wiki","name":"Umbra Wiki",
  # "command":"umbra-wiki","process":"umbra-wiki","description":"…"}
  while IFS=$'\t' read -r id name command process description; do
    [[ -n $id ]] || continue
    command -v "${command%% *}" &>/dev/null || continue
    running=$(count_sessions "${process:-${command%% *}}")
    entry "app:$command" "$name" local "$running" false "$description" false
    locals=$((locals + 1))
  done < <(jq -r '(if type == "array" then .[] elif type == "object" then . else empty end) | [.id, .name, .command, (.process // ""), (.description // "")] | @tsv' <<<"$local_apps" 2>/dev/null)

  # Installed Ollama models, when the service answers.
  if [[ $show_ollama == true ]] && command -v ollama &>/dev/null; then
    while read -r model; do
      [[ -n $model ]] || continue
      running=$(awk -v m="$model" '{ b = $1; sub(".*/", "", b); if (b == "ollama" && $2 == "run" && $3 == m) n++ } END { print n + 0 }' <<<"$procs")
      entry "ollama:$model" "$(pretty_model "$model")" local "$running" false "Ollama model · offline" false
      locals=$((locals + 1))
    done < <(curl -s --max-time 1 http://127.0.0.1:11434/api/tags 2>/dev/null | jq -r '.models[]?.name' 2>/dev/null)
  fi

  if ((locals == 0)); then
    entry "setup-local" "Set up a local AI" local 0 false "Install Ollama and a model · guided" true
  fi

  default=$(omarchy-default-agent 2>/dev/null)
  for agent in "${known_agents[@]}"; do
    installed "$agent" || continue
    running=$(count_sessions "$agent")
    [[ $agent == "$default" ]] && is_default=true || is_default=false
    entry "$agent" "$(agent_name "$agent")" online "$running" "$is_default" "" false
  done
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
  ollama:*) command=(ollama run "${agent#ollama:}") ;;
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

launch_app() {
  local command=${1:?launch-app needs a command}
  # shellcheck disable=SC2086 # the configured command may carry arguments
  exec setsid uwsm-app -- $command
}

# Interactive: runs in a floating terminal opened from the widget.
setup_local() {
  cat <<'EOF'

  SET UP A LOCAL AI

  This installs Ollama, which runs AI models directly on this computer,
  then downloads one model of your choice. Once set up it works fully
  offline, and nothing you ask leaves this machine.

  Steps:  1. install Ollama (needs your password)
          2. start the Ollama background service
          3. download a model (1–5 GB)

EOF
  gum confirm "Continue?" || exit 130

  if ! command -v ollama &>/dev/null; then
    echo "Installing Ollama…"
    omarchy-pkg-add ollama || { echo "Could not install Ollama."; exit 1; }
  fi
  echo "Starting the Ollama service…"
  sudo systemctl enable --now ollama || { echo "Could not start the Ollama service."; exit 1; }
  for _ in $(seq 30); do curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done

  local choice model
  choice=$(gum choose --header "Pick a model (larger = smarter, but slower and needs more memory):" \
    "gemma3:1b    ~0.8 GB  fastest, basic answers, any laptop" \
    "gemma3:4b    ~3.3 GB  recommended balance, 8 GB RAM or more" \
    "llama3.1:8b  ~4.9 GB  most capable, 16 GB RAM, slow without a GPU") || exit 130
  model=${choice%% *}

  echo
  echo "Downloading $model…"
  ollama pull "$model" || { echo "Download failed. Run: ollama pull $model"; exit 1; }

  echo
  echo "Done. $model now appears under LOCAL in the Agent Tool."
  if gum confirm "Start chatting with it now?"; then
    exec ollama run "$model"
  fi
}

case "${1:-}" in
status) status "${2:-[]}" "${3:-true}" ;;
launch) launch "${2:-}" ;;
launch-app) launch_app "${2:-}" ;;
setup-local) setup_local ;;
*)
  echo "Usage: agents.sh status [local-apps-json] [show-ollama] | launch <id> | launch-app <command> | setup-local" >&2
  exit 1
  ;;
esac
