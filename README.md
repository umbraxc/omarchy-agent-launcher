# Omarchy Umbra Agent Tool

An Omarchy bar widget for all your AI in one place: **Umbra Wiki**, an
offline survival assistant that runs entirely on your computer, and the
coding agents you use online. See what's running, open anything with one
click, and theme it all.

![Omarchy Umbra Agent Tool panel](preview.png)

## The widget

- A bar icon (the Umbra emblem) that lights up while anything is running and
  dims when nothing is.
- Left click opens a panel with three sections:
  - **LOCAL**: **Umbra Wiki**. Shows **Ready**, or **Active** with its open
    window count. Not installed yet? The entry reads **Set up Umbra Wiki**
    and runs the guided setup below.
  - **THEME**: one swatch per Umbra Wiki theme. Click to switch; an open
    Umbra Wiki window follows instantly, and the panel's accent colour does
    too.
  - **ONLINE AGENTS**: every installed coding agent, marked **Online** (with
    its session count) or **Offline**. Your default agent is labelled.
- Click an entry to open it in a new window.
- Keyboard: `j`/`k` or the arrow keys to move, Enter to open, `r` to refresh,
  Esc to close.

## Umbra Wiki

A question-and-answer assistant that feels like a conversation, built for
when there's no internet, no help and no time to search:

- **Answers from your own offline library**: it searches your archives,
  picks the passages that matter, and a local AI model (via
  [Ollama](https://ollama.com)) answers with citations. Hover a citation for
  a summary; click it to read the full article.
- **Talks back**: asks you questions when your situation is unclear, and
  suggests a useful follow-up after each answer.
- **Safe with numbers**: quantities, doses and times are only stated when
  they appear in the sources.
- **Local by default, online when you choose**: a LINK switch adds
  Wikipedia search when you have a connection, with a clear warning and a
  confirmation to go back to local only.
- **Library**: install extra collections (medicine, repair, energy,
  gardening, radio and more) from the Library panel; downloads resume and are
  checked against their official checksums.
- **Nine themes** (Umbra, Ember, Radiation, Frostbite, Rust Belt, Nightfall,
  Bunker, Blood Moon, Daybreak), quiet interface sounds with a mute button,
  and a lock that freezes the window until you unlock it.

### Set up Umbra Wiki

Click **Set up Umbra Wiki** in the widget. A terminal walks you through:

1. installing Ollama and a few system packages (asks for your password)
2. choosing an AI model: `gemma3:4b` (recommended, 3.3 GB), `gemma3:1b`
   (fastest, 0.8 GB) or `llama3.1:8b` (most capable, 4.9 GB)
3. optionally downloading the **Survival Essentials** library (0.9 GB:
   water treatment, food preparation, knots, field and military medicine,
   post-disaster guides)
4. installing the Umbra Wiki app (launcher, app menu entry, icon and a
   background service)

Nothing is installed until you confirm. Everything is stored in your home
folder: the library in `~/UmbraWiki/library`, settings in
`~/.config/umbra-wiki/`.

Speed depends on your computer: on a laptop without a GPU, expect the first
words after 15–40 seconds and a full answer in about a minute.

## Install

```bash
omarchy plugin add https://github.com/umbraxc/omarchy-umbra-agent-tool
omarchy bar put io.github.umbraxc.agent-launcher --before omarchy.network
```

The second command puts the icon just left of the Wi-Fi icon. Put it anywhere
you like with `omarchy bar move`.

## Uninstall

```bash
omarchy plugin remove io.github.umbraxc.agent-launcher
```

This disables the plugin, unloads it from the bar and deletes its folder. If
you set up Umbra Wiki, also remove what it installed in your home folder:

```bash
systemctl --user disable --now umbra-wiki
rm -f ~/.local/bin/umbra-wiki ~/.config/systemd/user/umbra-wiki.service \
  ~/.local/share/applications/org.umbra.wiki.desktop \
  ~/.local/share/icons/hicolor/scalable/apps/org.umbra.wiki.svg
rm -rf ~/.config/umbra-wiki ~/UmbraWiki      # your settings and library
```

Ollama and its models stay installed; remove them with
`omarchy pkg drop ollama` and `sudo rm -rf /var/lib/ollama` if you no longer
want them.

## Settings

| Key | Default | What it does |
|---|---|---|
| `pollIntervalMs` | `5000` | How often the running counts refresh |

```bash
omarchy bar set io.github.umbraxc.agent-launcher pollIntervalMs 10000 --json
```

Umbra Wiki's own settings live in `~/.config/umbra-wiki/config.json`
(`model`, `libraryDir`) and `settings.json` (`theme`, `muted`).

## How it works

- `Panel.qml` draws the bar icon and panel; `agents.sh` lists agents, opens
  them, switches themes and runs the guided setup.
- `umbra-wiki/` is the app: `server.py` (a local backend on 127.0.0.1 that
  runs `kiwix-serve` over the library, searches it and streams the model's
  answer), `ui/` (the interface), `umbra-wiki` (the window), `install.sh`,
  `fetch-archive.sh` and `library.json` (the collection catalog with sizes
  and checksums).

## Requirements

- Omarchy shell with third-party bar-widget support
- Optional: coding agents for the ONLINE section

Showing and opening entries needs no network access and never uses `sudo`.
Only **Set up Umbra Wiki**, after you confirm, installs packages (`ollama`,
`python-gobject`, `webkit2gtk-4.1`, `gst-plugins-good`, `kiwix-tools`) with
your password and downloads the model and library you choose. Umbra Wiki
listens only on `127.0.0.1`; in LOCAL mode nothing leaves your computer.

## Credits

Library collections are published by their respective projects and
distributed by [Kiwix](https://kiwix.org). AI models are provided through
[Ollama](https://ollama.com) under their own licenses.

## License

MIT
