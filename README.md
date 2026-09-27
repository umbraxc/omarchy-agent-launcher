# Omarchy Umbra

**Knowledge that works when nothing else does.**

Omarchy Umbra puts **Umbra Wiki**, an offline survival assistant, one click
away in your [Omarchy](https://omarchy.org) bar, next to your coding agents.
Umbra Wiki is a local AI that answers from a library stored on your own
computer, cites its sources, and keeps working with no internet, no account
and no subscription. Nothing you ask leaves your machine.

![Umbra Wiki's start screen](docs/hero.png)

- **Offline and private**: a local AI (through Ollama) reads from offline
  field manuals, medical guides and repair libraries on your disk.
- **Answers you can check**: every answer cites its sources, and a built-in
  field manual covers the critical basics.
- **Made to be lived with**: scenarios and personalities, a welcome tour,
  history, voice input, 22 themes, animated backgrounds and transitions, and
  an off-grid battery saver.
- **Runs on Omarchy and on any Arch Linux**: the bar widget is Omarchy's;
  Umbra Wiki itself runs anywhere on Arch.

---

## Contents

- [Umbra Wiki](#umbra-wiki)
- [The bar widget](#the-bar-widget)
- [Install](#install)
- [First launch: the welcome tour](#first-launch-the-welcome-tour)
- [Requirements and speed](#requirements-and-speed)
- [Privacy and security](#privacy-and-security)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Update, reset, uninstall](#update-reset-uninstall)
- [Troubleshooting](#troubleshooting)
- [How it works](#how-it-works)
- [Safety](#safety)
- [Credits and license](#credits-and-license)

---

## Umbra Wiki

### Answers you can check

Ask anything in plain words. Umbra searches its offline library and its field
manual, then answers in the voice of the personality you picked, with
numbered citations. Hover a citation for a summary; click it to read the page
itself. Umbra usually ends with an offer ("If you like, I can…"), and a
suggested reply is always one **Tab** away.

![An answer with sources](docs/answer.png)

While it thinks, a little ASCII scene that fits your scenario plays next to
a rotating field note, and Umbra's working lines keep you company. Answers
take about a minute on an ordinary laptop, because everything runs on your
own computer.

![Umbra at work](docs/waiting.png)

### A field manual that is always there

Twenty short pages of critical basics ship with Umbra, from severe bleeding
and CPR to making water safe, fire, shelter, signalling, power cuts,
earthquakes, floods and a 72-hour kit. They're always available, Umbra uses
them first in its answers, and you can export the whole manual to print it or
keep it on a USB stick.

![The field manual](docs/manual.png)

### A library you can grow

Pick a pack in the welcome tour or the Library panel (Survival Essentials
0.9 GB, Prepared 3.4 GB, or Complete 10.1 GB with all 19 collections), or
choose collections one by one: medicine, repair guides, gardening, off-grid
power, amateur radio, wilderness skills and more. Downloads run in the
background, are checked for damage, and join the library as they arrive.

![The library](docs/library.png)

### Local first, online when you choose

Umbra is fully offline by default. When you have internet, switch **LINK** to
**ONLINE** and it adds Wikipedia for fuller, more current answers, and tells
you which facts came from where. It always asks first, and every launch starts
local.

### Loadout: scenarios and personalities

A **scenario** tells Umbra the situation you're in: Everyday Prep, Wilderness,
Grid Down, Natural Disaster, Medical Emergency and Wasteland, plus Homestead,
Workshop, Code Dojo, Study Hall and Campfire Tales for learning, fixing and
fun. A **personality** sets how it talks: Umbra itself, the Sergeant, the
Medic, the Old-Timer, Marcus Aurelius, Shackleton, Sherlock Holmes and more.
You can create your own of both.

![Scenarios](docs/loadout-scenarios.png)
![Personalities](docs/loadout-personalities.png)

### Your profile

Your name, a few lines about you, a picture and an ASCII character you build
yourself. Umbra greets you by name, picks up from your last conversation, and
suggests questions that fit you. An optional password keeps the screen
private.

![Profile](docs/profile.png)
![The password lock](docs/lock.png)

### History, export and backup

Every conversation is saved on your computer. Reopen and continue any of
them, search through everything that was said, export conversations or the
field manual as plain files to your Documents folder or a USB stick, and back
up your whole Umbra (profile, settings, custom items, conversations) to one
file.

![History](docs/history.png)

### Look and feel

22 themes, from Umbra's own matte black and signal yellow to Neon City,
Aurora Borealis, Imperium and Art Deco, plus a theme editor and one that
follows your Omarchy theme.

![Themes](docs/themes-gallery.png)

Nine animated start-screen backgrounds: digital rain, rising rain, Saturn
rings orbiting the globe, starfield, night forest, snowfall, northern lights,
campfire embers and a radar sweep.

![Backgrounds](docs/backgrounds.png)

Every launch boots with **UMBRA // ONLINE**, a welcome by name and Umbra's
boot chime; closing asks first and signs off with **UMBRA // OFFLINE**. Eight
transition styles to choose from, with previews in Settings.

![Boot and goodbye](docs/transitions.png)

### Settings for how you use it

Text size, sound output and microphone, volume, which header buttons show,
transitions, backgrounds, reduced motion, the local AI model, voice input,
backups, and **off-grid mode**: a battery saver that calms the animations,
skips Umbra's extra AI work and keeps answers short, automatically when you
unplug if you like.

![Settings](docs/settings.png)

---

## The bar widget

Click the Umbra emblem in the Omarchy bar for Umbra at a glance: the spinning
globe, the model and library, quick **SOUND** and **OFF-GRID** switches, your
loadout, your latest conversations (click one to reopen it), the theme, your
coding agents (Claude Code, Codex and others) with their running sessions, and
an hourly field note. The emblem lights up in your theme's colour when an
answer is waiting in the background.

![The bar widget](docs/widget.png)

---

## Install

### On Omarchy

1. Install **Omarchy Umbra** from the Omarchy plugin marketplace. The Umbra
   emblem appears in your bar.
2. Click it, and under **LOCAL** click **Set up Umbra Wiki**. A terminal opens
   and asks for your password once. It installs Ollama and a few system
   packages (and the graphics-card build of Ollama if you have a supported
   NVIDIA or AMD card), installs the Umbra Wiki app, and offers voice input.
3. Umbra opens and its [welcome tour](#first-launch-the-welcome-tour) takes it
   from there.

### On Arch Linux (without Omarchy)

Umbra Wiki comes as a ready-made Arch package with every release. Download
it and install it with pacman, which also installs everything it needs:

```bash
curl -L -o umbra-wiki.pkg.tar.zst \
  https://github.com/umbraxc/omarchy-umbra/releases/latest/download/umbra-wiki-latest-any.pkg.tar.zst
sudo pacman -U umbra-wiki.pkg.tar.zst
sudo systemctl enable --now ollama     # once: starts the local AI engine
umbra-wiki                             # or open "Umbra Wiki" from your app launcher
```

The welcome tour then picks the AI model and the library with you. To
update, run the same two commands again when a new release is out. Each
release lists the package's SHA-256 checksum in `SHA256SUMS`.

For voice input, install [voxtype](https://voxtype.io) from the AUR
(`yay -S voxtype-bin && voxtype setup --download --model base.en`), then
hold **F9** in the Umbra window to talk.

<details>
<summary>Build the package yourself</summary>

The recipe is in [`aur/PKGBUILD`](aur/PKGBUILD). It downloads the tagged
release, checks its checksum and builds the same package:

```bash
git clone https://github.com/umbraxc/omarchy-umbra.git
cd omarchy-umbra/aur && makepkg -si
```
</details>

An AUR package (`umbra-wiki`) is on its way: the recipe is ready and will be
published as soon as AUR account registration reopens. Then `yay -S
umbra-wiki` will work and updates will come with `yay -Syu`.

<details>
<summary>From the repository, without a package</summary>

```bash
git clone https://github.com/umbraxc/omarchy-umbra.git ~/.local/share/omarchy-umbra
~/.local/share/omarchy-umbra/install-arch.sh
```

The installer does the same as the Omarchy setup and then opens Umbra. Keep
the cloned folder: Umbra runs from it. It sets up voice input too if you
have `yay` or `paru`.
</details>

To update a repository install, pull the new version, then reinstall:
`git -C ~/.local/share/omarchy-umbra pull` and
`~/.local/share/omarchy-umbra/install-arch.sh --update`.

### What gets installed

| | |
|---|---|
| System packages | `ollama`, `python-gobject`, `webkit2gtk-4.1`, `gst-plugins-good`, `kiwix-tools`, `jq`, `curl`, `pciutils`, `pipewire-audio`, `xdg-utils`, `libnotify`, `gtk-update-icon-cache`, `ttf-jetbrains-mono-nerd` (only if missing), `ollama-cuda` or `ollama-rocm` for supported cards |
| The app | a launcher (`~/.local/bin/umbra-wiki`), an app-menu entry and icon, and a background service (`umbra-wiki.service`, per user) |
| Chosen in the tour | an AI model (0.8 to 4.9 GB) and library packs (0.9 to 10.1 GB) |
| Optional | voice input: voxtype and its English speech model (about 0.2 GB) |

---

## First launch: the welcome tour

Umbra introduces itself and sets itself up with you, one step at a time: your
name and an optional password, what Umbra is for, the AI model (it looks at
your processor, memory and graphics card and recommends one), the library
packs, a theme, a scenario and a personality, text size, background and
off-grid mode, then a spotlight tour of every control. It runs once; replay
it any time from Settings.

![The welcome tour](docs/tour.png)

---

## Requirements and speed

- Arch Linux (Omarchy for the bar widget), with PipeWire or PulseAudio.
- 8 GB of memory or more for the recommended model; 4 GB works with the
  smallest.
- Disk space for the model and the library you choose (1 to 15 GB).

| Model | Download | Memory | What to expect |
|---|---|---|---|
| Gemma 3 · 1B | 0.8 GB | 4 GB | fastest, basic answers |
| Gemma 3 · 4B (recommended) | 3.3 GB | 8 GB | a good balance |
| Llama 3.1 · 8B | 4.9 GB | 16 GB | most capable, slow without a graphics card |

Everything runs on your own computer. On a typical laptop processor an
answer takes one to three minutes; a supported NVIDIA or AMD graphics card
makes it much faster. Off-grid mode shortens answers to save time and
battery.

Umbra Wiki speaks and understands English.

---

## Privacy and security

- **Nothing leaves your computer** in local mode: the AI, the library, your
  history and your settings are all on your disk. Online mode sends only
  your question's key words to Wikipedia, and only after you switch it on.
- Your data lives in `~/.config/umbra-wiki` (settings, profile) and
  `~/.local/share/umbra-wiki` (history). Exports and backups go to
  `~/Documents/Umbra` or the USB stick you choose.
- The **optional password** is stored only as a salted, slow hash. It keeps
  Umbra's screen private; it does not encrypt your files. Umbra's background
  service listens only on your own computer (127.0.0.1), where other
  programs you run can reach it, as with most local apps.

---

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Enter / Shift+Enter | send / new line |
| Tab | use the suggested reply |
| F9 | hold to talk |
| Esc | stop an answer, close a panel |
| Ctrl+Z / Ctrl+Y | undo / redo in the prompt |
| Ctrl+N | new conversation |
| Ctrl+H / Ctrl+F | history / search conversations |
| Ctrl+E | export this conversation |
| Ctrl+L | library and field manual |
| Ctrl+P / Ctrl+O | profile / loadout |
| Ctrl+T | themes |
| Ctrl+M | mute |
| Ctrl+, | settings |
| F1 | all shortcuts |

![Keyboard shortcuts](docs/shortcuts.png)

---

## Update, reset, uninstall

- **Update**: on Omarchy, plugin updates arrive through Omarchy and Umbra
  picks them up; for the Arch package, download and install the newest
  release the same way; for a repository install, `git pull` the folder and
  run `install-arch.sh --update`. Your settings,
  history and library are never touched by updates.
- **Reset**: Settings → Danger zone → Reset Umbra starts over as if freshly
  installed (the tour runs again); the AI model and library are kept.
- **Uninstall**: Settings → Danger zone → Uninstall Umbra removes the app,
  its service, settings and history, and optionally the library and the AI
  model. System packages stay, since other programs may use them. On
  Omarchy, remove the bar widget from Omarchy's plugin settings; for the
  Arch package, finish with `sudo pacman -R umbra-wiki`.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| STATUS says NO MODEL | pick or download a model in Settings → AI model |
| STATUS says CORE OFFLINE | Ollama isn't running: `sudo systemctl enable --now ollama` |
| The window says the backend failed | `systemctl --user status umbra-wiki` and `journalctl --user -u umbra-wiki` |
| No sounds | check Settings → Sound (output, volume, mute) |
| Answers are slow | normal on a processor; try the 1B model or off-grid mode |
| Voice input missing | Omarchy: `omarchy-voxtype-install`; Arch: `yay -S voxtype-bin && voxtype setup --download --model base.en` |

---

## How it works

- **The bar widget** (`Panel.qml`, `agents.sh`) is an Omarchy shell plugin.
- **Umbra Wiki** (`umbra-wiki/`) is a small Python backend (`server.py`,
  standard library only) and a GTK + WebKit window (`umbra-wiki`) showing a
  local web interface (`ui/`). The backend runs `kiwix-serve` for the library,
  searches it and the field manual, and asks the model through Ollama's API.
- Downloads run in their own systemd units, verified against SHA-256
  checksums (`library.json`).

For development, a second instance with its own data runs next to your own:
`XDG_CONFIG_HOME=/tmp/u/c XDG_DATA_HOME=/tmp/u/d UMBRA_PORT=8866
UMBRA_KIWIX_PORT=8865 python3 umbra-wiki/server.py`, then
`UMBRA_PORT=8866 umbra-wiki --autotour` plays the welcome tour by itself.

---

## Safety

Umbra Wiki, its field manual and its answers are general information for
preparedness and emergencies. They are **not medical, legal or professional
advice** and not a substitute for training or emergency services. The AI can
make mistakes: check critical steps against the cited sources, and call your
local emergency number (112, 911, 999) whenever you can.

---

## Credits and license

Omarchy Umbra is released under the [MIT License](LICENSE). Sounds by
[Kenney](https://kenney.nl) (CC0). The offline library comes from
[Kiwix](https://kiwix.org) and [openZIM](https://openzim.org), each collection
under its publisher's license. AI models are downloaded through
[Ollama](https://ollama.com) under their makers' terms. The full list is in
[CREDITS.md](CREDITS.md).

Umbra was designed and directed by **umbraxc** and built together with
[Claude](https://claude.com), Anthropic's AI assistant.
