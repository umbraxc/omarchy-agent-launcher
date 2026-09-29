// Umbra Wiki attachments: the paperclip left of the prompt (or files dropped
// anywhere on the window). Text files are read and sent along with the
// question; pictures are shrunk (the AI looks at them on this computer, and
// big ones are slow) and sent for a model that can see. Shown as chips above
// the prompt until sent. Loaded after app.js (uses $, Sound, escapeHtml, fmtSize).
"use strict";

window.UmbraAttach = (() => {
  const MAX_FILES = 4, MAX_TEXT = 24000, MAX_SIDE = 1024;
  const TEXT = /\.(txt|md|markdown|csv|tsv|json|log|xml|html?|ya?ml|ini|cfg|conf|toml|py|js|ts|sh|c|h|cpp|java|rs|go|rb|sql|srt|gpx|kml)$/i;
  let files = [];
  const bar = $("#attached"), btn = $("#attach");
  const picker = document.createElement("input");
  picker.type = "file"; picker.multiple = true; picker.hidden = true;
  picker.accept = "image/*,text/*,.md,.csv,.json,.log,.gpx,.kml,.srt";
  document.body.appendChild(picker);

  const size = (b) => (b < 1024 ? `${b} B` : b < 1e6 ? `${Math.round(b / 1024)} KB` : fmtSize(b));
  function render() {
    bar.hidden = !files.length;
    btn.classList.toggle("on", files.length > 0);
    bar.innerHTML = files.map((f, i) => `<span class="at-chip ${f.kind}">${f.kind === "image" ? `<img src="data:image/jpeg;base64,${f.data}" alt="">` : "<b>\u{F0219}</b>"}
      <span>${escapeHtml(f.name)}</span><small>${f.kind === "image" ? "PICTURE" : size(f.size)}</small><button type="button" data-i="${i}" title="Remove">✕</button></span>`).join("") +
      (files.length ? `<span class="at-note">${files.some((f) => f.kind === "image") ? "Pictures need a model that can see (Core panel)." : "Umbra reads these with your next question."}</span>` : "");
    bar.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); render(); Sound.click(); }));
  }
  function note(text) {
    if (typeof confirmDialog === "function") confirmDialog({ kind: "error", tag: "ATTACH", title: "CAN'T ATTACH THAT", body: text, cancel: "OK" });
  }

  // A picture, made smaller and turned into JPEG.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable picture")); };
      img.src = url;
    });
  }

  async function add(list) {
    for (const f of [...list]) {
      if (files.length >= MAX_FILES) { note(`Up to ${MAX_FILES} files at a time.`); break; }
      try {
        if (f.type.startsWith("image/")) {
          files.push({ kind: "image", name: f.name, size: f.size, data: await shrink(f) });
        } else if (f.type.startsWith("text/") || TEXT.test(f.name) || f.type === "application/json") {
          const text = await f.text();
          files.push({ kind: "text", name: f.name, size: f.size, text: text.slice(0, MAX_TEXT), cut: text.length > MAX_TEXT });
        } else {
          note(`${f.name}: Umbra can read text files and look at pictures. ${/\.pdf$/i.test(f.name) ? "PDFs aren't supported yet: copy the text into a .txt file." : "This kind of file isn't supported."}`);
        }
      } catch { note(`${f.name} couldn't be read.`); }
    }
    render();
    if (files.length) Sound.found();
    $("#q").focus();
  }

  btn.addEventListener("click", () => { if (!locked) { picker.value = ""; picker.click(); Sound.click(); } });
  picker.addEventListener("change", () => add(picker.files));
  // Drop anywhere on the window.
  let depth = 0;
  addEventListener("dragenter", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { depth++; document.body.classList.add("dropping"); } });
  addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; document.body.classList.remove("dropping"); } });
  addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  addEventListener("drop", (e) => {
    depth = 0; document.body.classList.remove("dropping");
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    if (!locked) add(e.dataTransfer.files);
  });

  return {
    count: () => files.length,
    // Hands the files over for a question, and clears them.
    take() { const out = files.map(({ kind, name, text, data, cut }) => ({ kind, name, text, data, cut })); files = []; render(); return out; },
  };
})();
