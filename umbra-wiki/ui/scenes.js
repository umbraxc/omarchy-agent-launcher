// Umbra Wiki waiting scenes: small ASCII animations shown while Umbra
// searches, a few for each scenario. One is picked per question and plays
// until the answer starts (the globe takes over while it thinks).
"use strict";

(() => {
  const rnd = (n) => Math.floor(Math.random() * n);
  const any = (list) => list[rnd(list.length)];
  const len = (s) => [...s].length;

  // A figure walking in place over ground that scrolls past.
  const walk = (bodies, ground) => ({
    ms: 170,
    frame: (t) => {
      const g = ground.repeat(2), i = t % ground.length;
      return [...bodies[t % bodies.length], g.slice(i, i + 9)];
    },
  });
  const LEGS = ["  / >  ", "   |>  ", "  < \\  ", "   |\\  "];
  const figure = (head, torso) => LEGS.map((legs) => [`   ${head}   `, torso, legs]);

  const SCENES = {
    // ------------------------------------------------------- everyday
    survivor: walk(figure("O", "  /|\\# "), "._.-'-._.·´¯`·._.-'-._.·´¯`·"),

    pantry: {
      ms: 380,
      frame: (t) => {
        const n = Math.min(t % 9, 6);
        const s = (i) => (i < n ? "▣" : "·");
        return ["┌───────┐", `│ ${s(0)} ${s(1)} ${s(2)} │`, "├───────┤", `│ ${s(3)} ${s(4)} ${s(5)} │`, "└───────┘"];
      },
    },

    boil: {
      ms: 300,
      frame: (t) => [
        ["  ( ) (  ", "  ) ( )  ", "   ( ) ( "][t % 3],
        [" ) ( ) ) ", "  ( ) (  ", " ( ) ( ) "][t % 3],
        " [_____] ",
        "  " + any(["^^^^^", "^v^v^", "v^v^v", "^^v^^"]) + "  ",
      ],
    },

    checklist: {
      ms: 420,
      frame: (t) => {
        const n = Math.min(t % 7, 4);
        return ["WATER", "FOOD ", "LIGHT", "RADIO"].map((item, i) => `[${i < n ? "x" : " "}] ${item}`);
      },
    },

    // ----------------------------------------------------- wilderness
    hiker: walk(figure("o", "  /|\\▒ "), ",.'`,.;'.,'`.,;',.`'.,"),

    campfire: {
      ms: 200,
      frame: () => {
        const flame = (w) => Array.from({ length: w }, () => any(["(", ")", "^", "'", "("])).join("");
        const sparks = [..."         "];
        if (Math.random() < 0.6) sparks[2 + rnd(5)] = any(["·", ".", "'"]);
        return [sparks.join(""), `    ${flame(1)}    `, `   ${flame(3)}   `, `  ${flame(5)}  `, "  ╲╳╳╳╱  "];
      },
    },

    tent: {
      ms: 450,
      frame: () => {
        const star = (p) => (Math.random() < p ? any(["*", "+", "·"]) : "·");
        return [
          ` ${star(0.5)}    ${star(0.3)}   ${star(0.5)}`,
          `   ${star(0.3)}     ${star(0.4)}  `,
          "    /\\     ",
          "   /  \\    ",
          "  /_/\\_\\   ",
        ];
      },
    },

    compass: {
      ms: 260,
      frame: (t) => {
        const swing = "↑↗→↗↑↖←↖↑↗↑↖↑↑↑↑";
        return [" ╭── N ──╮ ", ` │   ${[...swing][t % len(swing)]}   │ `, " W       E ", " ╰── S ──╯ "];
      },
    },

    // ------------------------------------------------------ grid down
    candle: {
      ms: 240,
      frame: () => {
        const glow = () => (Math.random() < 0.3 ? "·" : " ");
        return [
          `  ${glow()} ${any(["(", ")", "'", "("])} ${glow()}  `,
          `   ${any(["(_)", "{_}", "(_)"])}   `,
          "   | |   ",
          "   | |   ",
          " ══╧═╧══ ",
        ];
      },
    },

    radio: {
      ms: 220,
      frame: (t) => [
        "  │ " + [" ", ")", "))", ")))", " ))", "  )"][t % 6],
        " ┌┴─────┐ ",
        " │◉ ≡≡≡ │" + "-\\|/"[t % 4],
        " └──────┘ ",
      ],
    },

    tally: {
      ms: 520,
      frame: (t) => {
        const n = Math.min((t % 9) + 1, 7);
        const marks = "|||||".slice(0, Math.min(n, 5)) + (n > 5 ? " " + "||".slice(0, n - 5) : "");
        return ["┌──────────┐", `│ ${marks.padEnd(8)} │`, `│  DAY 0${n}  │`, "└──────────┘"];
      },
    },

    // ------------------------------------------------ natural disaster
    tornado: {
      ms: 160,
      frame: (t) => [11, 9, 7, 5, 3].map((w, r) => {
        const body = Array.from({ length: w - 2 }, (_, i) => "~≈-"[(i + t + r) % 3]).join("");
        const sway = Math.round(Math.sin(t * 0.45 + r * 0.9) * r * 0.5);
        const left = (11 - w) / 2 + 2 + sway;
        const debris = Math.random() < 0.25 ? "·" : " ";
        return (debris + " ".repeat(left)).slice(0, left) + "(" + body + ")";
      }),
    },

    flood: {
      ms: 330,
      frame: (t) => {
        const house = ["    /\\     ", "   /  \\    ", "   |[]|    ", "   |  |    ", "   |__|    "];
        const level = [4, 4, 3, 3, 2, 2, 2, 3, 4][t % 9];
        return house.map((row, r) => (r < level ? row : [...row]
          .map((c, i) => (c === "|" ? c : "~≈"[(i + t + r) % 2])).join("")));
      },
    },

    storm: {
      ms: 150,
      frame: () => {
        const bolt = Math.random() < 0.12;
        const rain = () => Array.from({ length: 11 }, () => (Math.random() < 0.3 ? any(["'", "`", ","]) : " "));
        const r1 = rain(), r2 = rain();
        if (bolt) { r1[5] = "╲"; r2[5] = "╱"; }
        return ["   .--.    ", " .(    )-. ", "(___.__)__)", r1.join(""), r2.join("")];
      },
    },

    // ----------------------------------------------- medical emergency
    ecg: (() => {
      const wave = ["      /\\      ", "_____/  \\  ___", "         \\/   "];
      let bpm = 72;
      return {
        ms: 110,
        frame: (t) => {
          const i = t % 14;
          if (i === 0) bpm = 68 + rnd(9);
          return [...wave.map((r) => r.repeat(2).slice(i, i + 12)), `  ${t % 14 < 5 ? "♥" : " "} ${bpm} BPM  `];
        },
      };
    })(),

    firstaid: {
      ms: 260,
      frame: (t) => {
        const c = "█▓▒▓"[t % 4];
        return ["   ╭──╮   ", " ┌─┴──┴─┐ ", ` │  ${c}${c}  │ `, ` │${c.repeat(6)}│ `, ` │  ${c}${c}  │ `, " └──────┘ "];
      },
    },

    breathe: {
      ms: 700,
      frame: (t) => {
        const steps = [[1, "INHALE"], [2, "INHALE"], [3, "INHALE"], [3, " HOLD "], [3, " HOLD "],
                       [2, "EXHALE"], [1, "EXHALE"], [1, " HOLD "]];
        const [s, label] = steps[t % steps.length];
        const w = 2 * s + 3, pad = " ".repeat((9 - w) / 2);
        const box = ["┌" + "─".repeat(w - 2) + "┐", ...Array(s).fill("│" + " ".repeat(w - 2) + "│"),
                     "└" + "─".repeat(w - 2) + "┘"].map((r) => pad + r + pad);
        while (box.length < 5) { box.unshift(" ".repeat(9)); if (box.length < 5) box.push(" ".repeat(9)); }
        return [...box, ` ${label}  `];
      },
    },

    // ------------------------------------------------------ wasteland
    mushroom: (() => {
      const ground = "▁▁▁▁▁▁▁▁▁▁▁";
      const cloud = [
        ["           ", "           ", "           ", "           ", ground],
        ["           ", "           ", "           ", "     ·     ", "▁▁▁▁▁█▁▁▁▁▁"],
        ["           ", "           ", "    (@)    ", "     |     ", "▁▁▁▁▟█▙▁▁▁▁"],
        ["           ", "   (@@@)   ", "    (@)    ", "     |     ", "▁▁▁▟███▙▁▁▁"],
        ["  _(@@@)_  ", " (@@@@@@@) ", "    |@|    ", "    | |    ", "▁▁▟█████▙▁▁"],
        [" (@@@@@@@) ", "(@@@@@@@@@)", "  ~~|@|~~  ", "    | |    ", "▁▟███████▙▁"],
        null, null, null,
        [" ( . . . ) ", "( .  .  . )", "    : :    ", "    . .    ", ground],
        [" .   .   . ", "  .     .  ", "           ", "           ", ground],
      ];
      return {
        ms: 380,
        frame: (t) => {
          const f = cloud[t % cloud.length];
          // The cloud churns for a few frames before it drifts apart.
          return f || cloud[5].map((r, i) => (i < 4 ? r.replace(/@/g, () => any(["@", "%", "@", "&"])) : r));
        },
      };
    })(),

    masked: walk(figure("Ø", "  /|\\¤ "), "▁▂▁▃▁▁▂▅▂▁▁▃▂▁▁▂"),

    geiger: (() => {
      let level = 3;
      return {
        ms: 200,
        frame: () => {
          level = Math.max(1, Math.min(7, level + any([-1, 0, 1, 1])));
          const scale = [..." · · · · "];
          scale[level] = "┃";
          return [
            "┌─ RAD ───┐",
            "│" + scale.join("") + "│",
            "│ " + "■".repeat(level) + "·".repeat(7 - level) + " │",
            "└─────────┘",
            any(["  tk       ", "     tk tk ", "tk         ", "      tk   ", "           ", "  tk   tk  "]),
          ];
        },
      };
    })(),

    // ------------------------------------------- homestead, workshop
    garden: {
      ms: 480,
      frame: (t) => {
        const ground = "▁▁▁▁▁▁▁▁▁";
        return [
          ["         ", "         ", "         ", "    .    ", ground],
          ["         ", "         ", "         ", "    |    ", ground],
          ["         ", "         ", "   \\|    ", "    |    ", ground],
          ["         ", "         ", "   \\|/   ", "    |    ", ground],
          ["         ", "    |    ", "   \\|/   ", "    |    ", ground],
          ["   (*)   ", "    |    ", "   \\|/   ", "    |    ", ground],
        ][Math.min(t % 9, 5)];
      },
    },

    gears: {
      ms: 200,
      frame: (t) => ["  .-.   .-.  ", ` ( ${"|/-\\"[t % 4]} )=( ${"|\\-/"[t % 4]} ) `, "  '-'   '-'  ", "   ||   ||   ", " =========== "],
    },

    // ------------------------------------------ code dojo, study hall
    terminal: (() => {
      const script = ["$ python3 hello.py", "Hello, world!", "$ ls lessons/", "01-loops  02-lists", "$ git commit -am 'learned'", "1 file changed"];
      const w = 20;
      return {
        ms: 90,
        frame: (t) => {
          let n = t % 150;
          const lines = [];
          for (const l of script) {
            if (n <= 0) break;
            if (l.startsWith("$")) { lines.push(l.slice(0, Math.min(l.length, n))); n -= l.length + 8; }
            else { lines.push(l); n -= 6; }
          }
          const shown = lines.slice(-3);
          while (shown.length < 3) shown.push("");
          const cursor = t % 6 < 3 ? "▌" : " ";
          const last = shown.map((l) => l).findLastIndex((l) => l);
          return ["┌─ dojo " + "─".repeat(w - 9) + "┐",
                  ...shown.map((l, i) => "│" + (l + (i === last ? cursor : "")).slice(0, w - 2).padEnd(w - 2) + "│"),
                  "└" + "─".repeat(w - 2) + "┘"];
        },
      };
    })(),

    build: {
      ms: 260,
      frame: (t) => {
        const p = t % 14;
        if (p >= 11) return [" BUILD OK ✓  ", "[██████████] ", "  100%       "];
        return [" COMPILING…  ", "[" + "█".repeat(p) + "░".repeat(10 - p) + "] ", `  ${String(p * 10).padStart(3)}%       `];
      },
    },

    bulb: {
      ms: 520,
      frame: (t) => (t % 4 < 2
        ? ["           ", "    .-.    ", "   (   )   ", "    \\ /    ", "    |=|    "]
        : ["  \\  |  /  ", "    .-.    ", " --( * )-- ", "    \\ /    ", "    |=|    "]),
    },

    flashcards: {
      ms: 650,
      frame: (t) => [
        ["┌───────┐", "│   ?   │", "│  ~~~  │", "└───────┘"],
        ["┌───────┐", "│   ?   │", "│  ~~~  │", "└───────┘"],
        ["   ┌─┐   ", "   │ │   ", "   │ │   ", "   └─┘   "],
        ["┌───────┐", "│   !   │", "│  ~~~  │", "└───────┘"],
        ["┌───────┐", "│   !   │", "│  ~~~  │", "└───────┘"],
        ["   ┌─┐   ", "   │ │   ", "   │ │   ", "   └─┘   "],
      ][t % 6],
    },
  };

  const SETS = {
    everyday: ["survivor", "pantry", "boil", "checklist"],
    wilderness: ["hiker", "campfire", "tent", "compass"],
    griddown: ["candle", "radio", "tally"],
    disaster: ["tornado", "flood", "storm"],
    medical: ["ecg", "firstaid", "breathe"],
    wasteland: ["mushroom", "masked", "geiger"],
    homestead: ["garden", "pantry", "boil"],
    workshop: ["gears", "radio", "tally"],
    codedojo: ["terminal", "build"],
    studyhall: ["bulb", "flashcards", "checklist"],
    tales: ["campfire", "tent", "storm"],
  };

  // A scene for this scenario, avoiding the one shown last time.
  function pick(scenario, avoid) {
    const set = SETS[scenario] || SETS.everyday;
    const options = set.length > 1 ? set.filter((n) => n !== avoid) : set;
    return any(options);
  }

  // Plays a scene into a <pre>; lines are padded to a steady block so the
  // centred art never jumps. Returns a function that stops it.
  function run(name, el) {
    const scene = SCENES[name] || SCENES.survivor;
    let t = 0, alive = true, rows = 0, width = 0;
    const tick = () => {
      if (!alive || !el.isConnected) return;
      const lines = scene.frame(t++).slice();
      rows = Math.max(rows, lines.length);
      while (lines.length < rows) lines.unshift("");
      width = Math.max(width, ...lines.map(len));
      el.textContent = lines.map((l) => l + " ".repeat(width - len(l))).join("\n");
      setTimeout(tick, scene.ms);
    };
    tick();
    return () => { alive = false; };
  }

  window.UmbraScenes = { pick, run, SETS, SCENES };
})();
