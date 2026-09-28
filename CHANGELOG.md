# Changelog

## 3.2.0

- **Performance in Settings**: a live graph of the processor (and Umbra's
  share), a bar per thread, temperature and memory, and an **AI processor
  limit** (25 / 50 / 75 / 100%) that caps the cores the AI uses while it
  writes.
- **One long page**: the start screen stays above the conversation, so
  scrolling up (also while Umbra is answering) brings it back. Scrolling up
  now works on touchpads during an answer too.
- **Home**: click the emblem or name in the top left for a new conversation.
- Panels that refresh themselves (library and model downloads, history,
  loadout cards) keep their scroll position instead of jumping to the top.
- The boot and goodbye animations follow the window when it's resized or
  made fullscreen mid-animation, and are sharp on scaled (HiDPI) screens.
- **No sound?** Settings → Sound says when no sound player is installed and
  shows the command to fix it; the README has a step-by-step checklist.

## 3.1.0

- **An Arch package and repository**: `umbra-wiki` installs system-wide on
  any Arch Linux from the signed **[umbra]** pacman repository
  (https://umbraxc.github.io/umbra-repo/), with updates through
  `pacman -Syu`; each release also carries the package file. Built from a
  pinned, checksummed release by `aur/PKGBUILD`, ready for the AUR as soon
  as registration reopens.
- The welcome tour notices when Ollama isn't running yet and shows how to
  start it.
- Uninstall in Settings knows when Umbra was installed as a package: it
  removes your data and shows the pacman command for the app itself.

## 3.0.0

Umbra Wiki grows from a search window into a complete offline assistant.

- **Answers**: conversational answers with citations, hover summaries, offers
  and suggested replies; mode-aware (local or online); short, safe answers in
  off-grid mode.
- **Umbra Field Manual**: 20 built-in pages of critical basics, used first in
  answers, exportable.
- **Library**: packs (Essentials, Prepared, Complete), background downloads
  with verification and progress.
- **Loadout**: 11 scenarios and 14 personalities, and your own of both.
- **Profile**: name, about, picture, ASCII character, optional password;
  greetings and suggested questions that fit you.
- **History**: continue, search inside, export to Documents or USB, quick
  delete with undo; backup and restore of your whole Umbra.
- **Welcome tour**: sets Umbra up on first launch (model, library, theme,
  loadout, comfort) and explains every control.
- **Look and feel**: 22 themes and an editor, 9 animated backgrounds, boot and
  goodbye sequences with 8 transition styles, a boot chime, waiting scenes,
  a prompt status line and block cursor.
- **Settings**: sound devices, text size, header buttons, off-grid mode,
  model choice and downloads, voice input, keyboard shortcuts (F1), reset and
  uninstall.
- **Voice input**: F9 or the microphone button, offline, through voxtype.
- **Bar widget**: Umbra header with status and quick switches, recent
  conversations, loadout, themes, coding agents, field notes; lights up when
  an answer is waiting.
- **Arch Linux**: `install-arch.sh` installs Umbra Wiki without Omarchy.

## 2.2.0

Bundled Umbra Wiki as the local AI with themes, a library catalog, sounds
and the Omarchy Umbra name.

## 1.0.0

The Agent Launcher bar widget for Omarchy.
