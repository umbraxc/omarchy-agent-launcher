# Changelog

## 3.1.1

- **Country files** on the map: click any country's name and a data window
  glitches in, tied to it by a pointed line: flag, an ASCII drawing, capital
  and main cities with coordinates and MGRS, languages, people, currency,
  climate, terrain, resources, hazards, neighbours, water and doctors (CIA
  World Factbook). Every country is named as you zoom in.
- **Safety levels**: mark countries safe, caution, avoid or danger; the map
  colours them at every zoom, with a key.
- **Pause and resume downloads** (maps, library, AI model), even after a
  restart, from a new downloads button at the top or where you started them;
  a chime and a note when one finishes.
- **What's new**: after an update, a note like this one, once.
- **Settings in six coloured categories** with jump chips; downloaded maps
  and waypoints are listed and removable in Your data.
- **Esc goes back where you came from**: the signal lamp to Training, a
  manual page opened from the Field Kit back to the Field Kit.
- Maps: tooltips on every button, a nudge towards downloading a detailed
  map, coordinate search in the forms the map shows, COPY on place cards,
  remove single waypoints, clearer icons, sounds on every control.

- **Maps** (Ctrl+G): OpenStreetMap, offline, from the whole world down to
  single streets, in a military Topographic style (relief shading and contour
  lines) and a dark Tactical one; smooth panning and zooming (tiles drawn in
  a background worker). Download a country or the area on screen, with an
  exact size first and only that area fetched; detail levels, relief and
  contours, and Essentials (every water tap, spring, shelter, pharmacy,
  hospital, toilet and fuel station). Search towns, streets and water nearest
  first, coordinates and MGRS; MGRS grid zones and readout; waypoints,
  measuring, Ask Umbra, full screen. A small world map is built in.
- **Field Kit** (Ctrl+K): CPR metronome, first-aid timers, pulse and
  breathing counter; sun and moon times and phases; how long your supplies
  last; Morse by ear and by hand, a signal lamp, daily drills and knots;
  printable pocket cards. Seven new achievements (58 in all).
- **Settings search**: find any setting as you type, with highlights.
- The welcome tour now sets up the whole profile (callsign, where you are,
  units, experience, household, health notes, name colour) and the AI
  processor limit, and shows Maps and Achievements.
- **Achievements**: 58 of them in four tiers with their own badges, progress
  bars, secret ones, an unlock chime and pop-up, points and ranks (Recruit to
  Legend), in the new ACHIEVEMENTS tab of the loadout. Earned ones are kept
  for good and included in backups; earlier conversations count after
  updating.
- **Profile**: callsign, where you are, units, experience, household and
  health notes (used to tailor answers), a name colour, and a service record
  with pinned badges.
- **Updates in Settings**: the current version, CHECK NOW (asks GitHub for
  the newest release) and how to update by hand.
- Icons are measured and centred exactly in their buttons; the spinner no
  longer turns green on some systems.
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
