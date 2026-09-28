# Changelog

## 3.1.1

- **Signals & Radar** reworked: a slower cinematic sweep with phosphor
  trails and contact pings, HUD readouts, INTEL (bands, security, makers,
  open networks) and an EVENT LOG of contacts appearing and leaving, full
  screen, and a **kill switch** that turns all radios off at once.
- **Field manuals** to download and read in Training: nine US Army field
  manuals, Sweden's *In Case of Crisis or War* and FEMA's *Are You Ready?*
- **Vault** also holds **valuables** (gold, silver, cash, jewellery) and
  **data** (drives, backups, document copies).
- **Maps**: 65 waypoint symbols from game-icons.net, a quiet ambient life on
  the map, a short tune of its own for every country, resource icons, water
  with a flowing river, and **armed forces** in the country files.
- **Themes** redesigned to really differ: Arctic Kill, Hazmat, Sahara Noon,
  Paper Map, Rose Quartz, Blueprint, Thermal, Graphite, Cobalt Strike,
  Monsoon, Tyrian, Lapis, Burgundy, Jade and more.
- **Umbra knows you better**: its answers take into account your record,
  supplies, waypoints, safety levels, manuals, training, a patient you're
  caring for and running first-aid timers (and your Vault, when you ask).
- The prompt stays still while you type, with the real cursor; suggested
  replies keep typing themselves in; a Tab hint; the start-screen questions
  can be hidden. History shows a small picture for each conversation.

- **Signals & Radar** (Ctrl+J): a command-centre screen with a sonar radar of
  the Wi-Fi networks and Bluetooth devices around you (click one for its
  details), your device's vitals and the Wi-Fi channels in use. No internet
  needed; passive.
- **Field Kit: Medic** grows to five pages: triage, coma scale and vital
  signs; burns with Parkland fluids, child doses, drip rate and oral
  rehydration; a patient chart and timed log with MIST and 9-line reports;
  quick guides.
- **Field Kit: the Vault**, a password-locked arsenal with a library of
  common firearms, ammunition and gear and an inspect view of each.
- **Sun & Moon** shows a live ASCII Earth, Sun and Moon, placed by their real
  positions, with a time-lapse.
- **Training**: a Morse challenge with points and streaks, the phonetic
  alphabet, radio procedure, grid references, compass and pace count, SALUTE.
- **Maps**: right-click for waypoints (15 military-style markers in eight
  colours), measuring, copying, range rings and the bearing from home.
- **Tab** opens quick actions; answers get buttons to the tool that fits, and
  Umbra knows its own features.
- **Profile** redesigned, with a dog tag, skills, blood type, allergies,
  medication and an emergency contact (also a printable ID card).
- **History folders** with a brief Umbra keeps in mind; pinning.
- The **field manual** in the Library has category colours and a small
  drawing for every page.

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
