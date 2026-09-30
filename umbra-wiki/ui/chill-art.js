// Occasional, quiet ASCII scenery for relaxed conversation. No model output is
// interpreted as markup; these bundled frames are safe to replay from History.
"use strict";
(() => {
  const art = {
    dawn: {
      name: "Morning over the hills",
      frames: [
`       .      .       .              .         .
            .         .      .             .
                     \\  |  /
            .         -- ☼ --              .
                     /  |  \\
          __..--..__        __..--..__
     __.-'          '--..--'          '-.__
  ~~~~~~~     ~~~~~~        ~~~~~~      ~~~~~~`,
`   .          .             .       .
          .         .                .
                     \\  |  /
                     -- ☼ --          .
            .        /  |  \\
          __..--..__        __..--..__
     __.-'          '--..--'          '-.__
  ~~~~~~       ~~~~~~     ~~~~~~       ~~~~~`],
    },
    forest: {
      name: "A still forest",
      frames: [
`      .            *             .        *
        /\\                 /\\
       /  \\      .        /  \\       .
      / /\\ \\             / /\\ \\
     /_/  \\_\\     /\\    /_/  \\_\\
       ||  ||     /  \\     ||  ||
   /\\  ||  ||    / /\\ \\    ||  ||   /\\
__/__\\_||__||___/_/  \\_\\___||__||__/__\\__`,
`   *         .                *         .
        /\\                 /\\
       /  \\       .       /  \\    .
      / /\\ \\             / /\\ \\
     /_/  \\_\\     /\\    /_/  \\_\\
       ||  ||     /  \\     ||  ||
   /\\  ||  ||    / /\\ \\    ||  ||   /\\
__/__\\_||__||___/_/  \\_\\___||__||__/__\\__`],
    },
    shore: {
      name: "Quiet shore",
      frames: [
`       .                    .          .
                   .                 .
          _______          ______
     ____/       \\________/      \\____
                .        .
  ~~~~~~    ~~~~~~~~    ~~~~~~    ~~~~~~~
      ~~~~~~    ~~~~~~~~    ~~~~~~
  .......  .......  .......  .......`,
`   .                 .              .
             .                 .
          _______          ______
     ____/       \\________/      \\____
               .            .
    ~~~~~~    ~~~~~~~~    ~~~~~~    ~~~~~
  ~~~~~~    ~~~~~~~~    ~~~~~~    ~~~~~~
  .......  .......  .......  .......`],
    },
    stars: {
      name: "Stars over camp",
      frames: [
`       *      .           +          .
   .          .       *          .
           +           .               *
          .       *        .       +
                        /\\
                       /  \\
          ___         /____\\       ___
  _______/   \\________|  |_______/   \\____`,
`   .           *          .        +
       *    .          .       *
             .      +               .
      +                *       .
                        /\\
                       /  \\
          ___         /____\\       ___
  _______/   \\________|  |_______/   \\____`],
    },
  };
  const ids = Object.keys(art);
  let lastTurn = -9, lastId = "";
  function select(question, turn) {
    const q = question.toLowerCase();
    if (!/(fun fact|interesting fact|random fact|tell me (a |another |some )?(story|stories)|how are you|what'?s up|quiet|stillness|relax|chill|vibe|beautiful day)/.test(q)) return "";
    if (turn - lastTurn < 3 || Math.random() > (/(fun fact|story)/.test(q) ? .55 : .3)) return "";
    const choices = ids.filter((x) => x !== lastId);
    lastId = choices[Math.floor(Math.random() * choices.length)]; lastTurn = turn;
    return lastId;
  }
  function render(after, id) {
    const scene = art[id]; if (!scene) return;
    const card = document.createElement("div");
    card.className = "chat-scene"; card.setAttribute("role", "img"); card.setAttribute("aria-label", scene.name);
    card.innerHTML = `<span>UMBRA // QUIET MOMENT</span><pre aria-hidden="true"></pre>`;
    const pre = card.querySelector("pre"); pre.textContent = scene.frames[0];
    after.after(card);
    if (document.body.classList.contains("reduce-motion")) return;
    let visible = false, frame = 0;
    const observer = new IntersectionObserver((entries) => { visible = entries[0]?.isIntersecting || false; });
    observer.observe(card);
    const timer = setInterval(() => {
      if (!card.isConnected) { clearInterval(timer); observer.disconnect(); return; }
      if (visible && !document.hidden && !document.body.classList.contains("reduce-motion")) {
        frame = (frame + 1) % scene.frames.length; pre.textContent = scene.frames[frame];
      }
    }, 1200);
  }
  window.UmbraChill = { select, render, ids };
})();
