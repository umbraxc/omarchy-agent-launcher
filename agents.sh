#!/bin/bash

# Backend for the Agent Launcher bar widget.
#
#   agents.sh status        One JSON line per installed coding agent:
#                           {"id","name","running","isDefault"}
#   agents.sh launch <id>   Open a new session of that agent in its own
#                           terminal window, flagged the way `omarchy agent`
#                           launches it.

known_agents=(claude codex opencode gemini cursor-agent copilot crush grok pi omp hermes muse)

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

status() {
  local default procs agent running is_default
  default=$(omarchy-default-agent 2>/dev/null)
  procs=$(ps -eo args --no-headers)

  for agent in "${known_agents[@]}"; do
    installed "$agent" || continue

    # A session is a process whose executable is the agent itself, or a
    # node/bun runtime whose script is the agent. Terminal wrappers such as
    # `foot -e claude` don't count, so each session is counted once.
    running=$(awk -v a="$agent" '{
      b = $1; sub(".*/", "", b)
      c = $2; sub(".*/", "", c)
      if (b == a || ((b == "node" || b == "bun") && c == a)) n++
    } END { print n + 0 }' <<<"$procs")

    [[ $agent == "$default" ]] && is_default=true || is_default=false
    printf '{"id":"%s","name":"%s","running":%d,"isDefault":%s}\n' \
      "$agent" "$(agent_name "$agent")" "$running" "$is_default"
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

case "${1:-}" in
status) status ;;
launch) launch "${2:-}" ;;
*)
  echo "Usage: agents.sh status | launch <agent>" >&2
  exit 1
  ;;
esac
