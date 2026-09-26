# Agent Launcher

An Omarchy bar widget that shows which AI coding agents are running and opens a
new session with one click.

![Agent Launcher panel](preview.png)

## Features

- A bar icon that lights up while any agent session is running and dims when
  none are. Hover it for the number of running sessions.
- Left click opens a panel listing every installed coding agent, each marked
  **Online** (with its session count) or **Offline**. Your default agent is
  labelled.
- Click an agent to open a new session of it in its own terminal window.
- Keyboard: `j`/`k` or the arrow keys to move, Enter to open, `r` to refresh,
  Esc to close.
- Middle click refreshes the status right away. Otherwise it refreshes every
  5 seconds.

Sessions open exactly the way `omarchy agent` opens them: the same unattended
flags, the same `org.omarchy.agent` window class (so your window rules still
apply), and starting in `~/Work` when that directory exists.

## Supported agents

Claude Code, Codex, OpenCode, Gemini, Cursor CLI, GitHub Copilot, Crush, Grok,
Pi, Oh My Pi, Hermes and Muse Code — the same agents
`omarchy default agent` offers.

Only agents that are actually installed are listed. Omarchy puts
install-on-first-run stubs in `~/.local/bin` for every agent it offers; the
widget recognises those and hides them until the agent is really installed.

## Install

```bash
omarchy plugin add https://github.com/umbraxc/omarchy-agent-launcher
omarchy bar put io.github.umbraxc.agent-launcher --before omarchy.network
```

The second command puts the icon just left of the Wi-Fi icon. Put it anywhere
you like with `omarchy bar move`.

## Uninstall

```bash
omarchy plugin remove io.github.umbraxc.agent-launcher
```

This disables the plugin, unloads it from the bar and deletes its folder. The
plugin writes no files of its own anywhere else, so there is nothing else to
clean up.

## Settings

| Key | Default | What it does |
|---|---|---|
| `pollIntervalMs` | `5000` | How often the running-session counts refresh |

```bash
omarchy bar set io.github.umbraxc.agent-launcher pollIntervalMs 10000 --json
```

## How it works

`Panel.qml` draws the bar icon and panel. `agents.sh` does the rest:

- `agents.sh status` prints one JSON line per installed agent with its running
  session count, found by matching process names.
- `agents.sh launch <agent>` opens a new session through `omarchy-launch-tui`.

## Requirements

- Omarchy shell with third-party bar-widget support
- At least one supported coding agent installed

No external dependencies. The widget uses only `bash`, `ps` and `awk`, which
every Omarchy system has, plus Omarchy's own `omarchy-default-agent` and
`omarchy-launch-tui` commands. It downloads nothing, needs no network access
and never uses `sudo`.

## License

MIT
