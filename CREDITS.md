# Credits and third-party notices

Omarchy Umbra and Umbra Wiki are released under the [MIT License](LICENSE),
© 2026 umbraxc. This file lists everything Umbra builds on or downloads, and
under which terms.

## What this repository contains

| Part | Author | License |
|---|---|---|
| Bar widget, Umbra Wiki app, backend, scripts, themes, ASCII art | umbraxc | MIT |
| Umbra Field Manual (`umbra-wiki/fieldmanual.json`) | umbraxc, written for Umbra from widely published first-aid and emergency guidance (Red Cross, NHS, CDC, FEMA) | MIT; see the safety note below |
| Field notes (`umbra-wiki/facts.json`) | umbraxc | MIT |
| Sounds: interface, sci-fi and UI audio packs (`umbra-wiki/sounds/`) | [Kenney](https://kenney.nl) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain); see `sounds/LICENSE-kenney.txt` |
| `boot.ogg`, `shutdown.ogg` | umbraxc, mixed from the Kenney sounds above | CC0 1.0 |
| `beep.ogg`, `glitch.ogg`, `achieve.ogg`, `complete.ogg` | umbraxc, synthesized | CC0 1.0 |

## Map symbols

| Part | By | License |
|---|---|---|
| Waypoint symbols (`umbra-wiki/ui/mapicons.js`) | [game-icons.net](https://game-icons.net): icons made by Lorc, Delapouite, John Colburn, Sbed, Skoll and Willdabeast | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |

## Field manuals (downloaded on request, not included)

The Training → Manuals page lists public manuals that are downloaded only
when you ask, from their sources (`umbra-wiki/manuals.json`):

| Manual | Publisher | Source | Terms |
|---|---|---|---|
| FM 21-76 Survival, FM 3-05.70 Survival, FM 4-25.11 First Aid, FM 3-25.26 Map Reading and Land Navigation, TC 21-3 Cold-Weather Areas, FM 90-3 Desert Operations, FM 3-97.61 Military Mountaineering, FM 5-125 Rigging Techniques, FM 21-18 Foot Marches | US Department of the Army | [Internet Archive](https://archive.org) | public domain (US government works) |
| In Case of Crisis or War | Swedish Civil Contingencies Agency (MSB) | [msb.se](https://www.msb.se) | as published by MSB |
| Are You Ready? | FEMA | [ready.gov](https://www.ready.gov) | public domain (US government work) |

## Offline library (downloaded on request, not included)

Umbra does not ship any library content. When you choose a pack or a
collection, it is downloaded from the [Kiwix](https://kiwix.org) servers,
where [openZIM](https://openzim.org) packages it from the original
publishers. Each collection stays under its publisher's license; check it
before you redistribute anything.

| Collection | Publisher | License |
|---|---|---|
| The Great Outdoors, Amateur Radio, Cooking (Seasoned Advice), Gardening & Landscaping, Sustainable Living Q&A | [Stack Exchange](https://stackexchange.com) contributors | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| WikiMed Medical Encyclopedia | [Wikipedia](https://wikipedia.org) contributors | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| iFixit repair guides | [iFixit](https://ifixit.com) contributors | [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/) |
| NHS Medicines A to Z | [NHS](https://www.nhs.uk) | [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/) |
| Appropedia | [Appropedia](https://www.appropedia.org) contributors | as published by Appropedia |
| energypedia | [energypedia](https://energypedia.info) contributors | as published by energypedia |
| WikEM | [WikEM](https://wikem.org) contributors | as published by WikEM |
| WikiVet | [WikiVet](https://en.wikivet.net) contributors | as published by WikiVet |
| Gardenology | [Gardenology](https://www.gardenology.org) contributors | as published by Gardenology |
| Military Medicine | US government field manuals, via the [Federation of American Scientists](https://irp.fas.org) | public domain (US government works) |
| Medical Library, Food for Preppers, Water Treatment Library, A Library of Knots, Post Disaster Resource Library | Various authors, collected by openZIM's [zimgit](https://github.com/openzim/zimgit) project | each document under its own terms |

## Maps

| Data | By | License |
|---|---|---|
| Map data (the built-in world map, and areas downloaded on request) | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, as vector tiles from the [Protomaps](https://protomaps.com) daily build | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/); Protomaps basemap BSD / ODbL |
| Elevation, for relief and contour lines (downloaded on request) | [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on AWS Open Data (Mapzen): SRTM, GMTED2010, ETOPO1, NED and other public sources | see the dataset's [attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| Country outlines for choosing an area (`umbra-wiki/maps/countries.json`), and the outlines, label points and main cities in the country files (`umbra-wiki/maps/atlas.json`) | [Natural Earth](https://www.naturalearthdata.com) (1:50m countries, populated places) | public domain |
| Country facts in the country files (`umbra-wiki/maps/atlas.json`) | [The World Factbook](https://www.cia.gov/the-world-factbook/), Central Intelligence Agency, via the [factbook.json](https://github.com/factbook/factbook.json) project | public domain (US government work); factbook.json CC0 1.0 |
| Flags (`umbra-wiki/ui/flags/`, rendered to small images) | [flag-icons](https://github.com/lipis/flag-icons) by Panayiotis Lipiridis | MIT |
| The land map of the live Earth in Sun & Moon (`umbra-wiki/ui/orrery.js`) | [Natural Earth](https://www.naturalearthdata.com) 1:110m countries, reduced to a 2° grid | public domain |

Signals & Radar names the maker of a device from the IEEE list of MAC
address prefixes that your system already has (`/usr/share/hwdata/oui.txt`,
from the hwdata package); nothing is bundled or downloaded for it.

Umbra reads the tiles and draws the maps itself; the map styles, symbols and
the drawing code are umbraxc's (MIT). Umbra shows the OpenStreetMap
attribution on the map.

Online mode reads [Wikipedia](https://wikipedia.org) articles (CC BY-SA 4.0)
through the Wikipedia API.

## AI models (downloaded on request through Ollama)

| Model | By | Terms |
|---|---|---|
| Gemma 3 (1B, 4B) | Google | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) |
| Llama 3.1 (8B) | Meta | [Llama 3.1 Community License](https://www.llama.com/llama3_1/license/) |
| Whisper base.en (voice input, through voxtype) | OpenAI | MIT |

## Software Umbra uses (installed from the Arch repositories or the AUR)

| Software | Used for | License |
|---|---|---|
| [Ollama](https://ollama.com) | runs the local AI | MIT |
| [kiwix-tools](https://kiwix.org) (kiwix-serve) | serves the offline library | GPL-3.0-or-later |
| [WebKitGTK](https://webkitgtk.org) and [PyGObject](https://pygobject.gnome.org) | the Umbra window | LGPL and others |
| [PipeWire](https://pipewire.org) | sound and microphone | MIT |
| [voxtype](https://voxtype.io) | offline voice input | MIT |
| [JetBrains Mono Nerd Font](https://www.nerdfonts.com) | Umbra's typeface | SIL Open Font License 1.1 |
| [Omarchy](https://omarchy.org) | the desktop the bar widget runs in | MIT |

## Built with Claude

Umbra was designed and directed by umbraxc and built together with
[Claude](https://claude.com), Anthropic's AI assistant, which wrote much of
the code, content and documentation under umbraxc's direction.

## Safety note

Umbra Wiki, its field manual and its answers are general information for
preparedness and emergencies. They are not medical, legal or professional
advice and are not a substitute for training or for emergency services. The
AI can make mistakes: check critical steps against the cited sources, and
call your local emergency number (112, 911, 999) whenever you can.
