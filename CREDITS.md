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
| `beep.ogg`, `glitch.ogg` | umbraxc, synthesized | CC0 1.0 |

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
