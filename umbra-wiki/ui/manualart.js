// Umbra Wiki field manual art: a small ASCII picture for every page of the
// manual (two frames, swapped slowly so each card breathes), and a colour
// per category, for the Library's manual cards.
"use strict";

window.UmbraManualArt = (() => {
  const A = {
    priorities: ["1 AIR   \n2 WATER \n3 WARMTH", "1 AIR ◂ \n2 WATER \n3 WARMTH"],
    bleeding: ["  .  \n ( ) \n  ▾  ", "  .  \n (●) \n  ▾ ."],
    cpr: [" ═╤═ \n  │  \n ╰─╯ ", " ═╤═ \n  ▼  \n ╰▀╯ "],
    choking: [" (o) \n  ║  \n ═╩═ ", " (O) \n  ▲  \n ═╩═ "],
    burns: ["  )  \n ( ) \n/ | \\", "  (  \n (^) \n/ | \\"],
    shock: [" /\\/ \n/  \\ \n‾‾‾‾ ", " /\\/\\\n/    \n‾‾‾‾ "],
    hypothermia: [" \\|/ \n—-*-—\n /|\\ ", "  |  \n -*- \n  |  "],
    heatstroke: [" \\ / \n- O -\n / \\ ", "  |  \n—(O)—\n  |  "],
    fractures: [" ═╗  \n  ╚═ \n  /  ", " ═╗  \n  ╚═ \n  \\  "],
    water: ["  .  \n ( ) \n ~~~ ", " . . \n ( ) \n~~~~~"],
    fire: ["  )  \n ) ( \n/\\/\\/", "  (  \n ( ) \n/\\/\\/"],
    shelter: ["  /\\  \n /  \\ \n/____\\", "  /\\  \n /░░\\ \n/____\\"],
    signal: [" \\|/ \n—SOS—\n /|\\ ", "  .  \n SOS \n  .  "],
    navigation: ["  N  \nW ✦ E\n  S  ", "  N  \nW ✧ E\n  S  "],
    outage: ["  ┬  \n (∙) \n  ┴  ", "  ┬  \n ( ) \n  ┴  "],
    earthquake: ["▁▂▃▁▂\n ╱╲  \n▔▔▔▔▔", "▂▁▃▂▁\n  ╱╲ \n▔▔▔▔▔"],
    flood: ["  ▲  \n ~~~ \n~~~~~", "  ▲  \n~~~~ \n ~~~~"],
    wildfire: [" )(  \n/\\/\\ \n▲▲▲▲▲", "  )( \n /\\/\\\n▲▲▲▲▲"],
    kit: [" ┌─┐ \n │+│ \n └─┘ ", " ┌─┐ \n │✚│ \n └─┘ "],
    food: [" ___ \n|~~~|\n|___|", " _._ \n|~~~|\n|___|"],
  };
  const FALLBACK = [" ┌─┐ \n │?│ \n └─┘ ", " ┌─┐ \n │ │ \n └─┘ "];
  const COLOR = {
    "First steps": "#d9b235", "First aid": "#e0493f", "Water, fire and shelter": "#36aec8",
    "Getting found": "#e8892a", "Emergencies at home": "#a77ce8", "Preparing": "#4fb86a",
  };
  return {
    art: (id) => A[id] || FALLBACK,
    color: (cat) => `color-mix(in oklab, ${COLOR[cat] || "#8a93a6"} 78%, var(--fg))`,
  };
})();
