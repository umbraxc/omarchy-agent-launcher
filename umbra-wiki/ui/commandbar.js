// Hold Control for tools; search only the conversation currently on screen.
"use strict";
(() => {
  const dock = document.querySelector(".dock");
  const bar = document.querySelector("#commandbar");
  const chooser = bar.querySelector(".command-choice");
  const searchRow = bar.querySelector(".command-search");
  const search = document.querySelector("#chat-find");
  const results = document.querySelector("#chat-find-results");
  const list = results.querySelector(".find-list");
  const count = bar.querySelector(".command-count");
  const panels = ["maps", "fieldkit", "farming", "radar", "loadout", "history", "library", "themes", "settings", "core"];
  let mode = "", matches = [], selected = -1, queryTimer = 0, flashTimer = 0;

  function available() {
    return !locked && !document.body.classList.contains("touring") && $("#modal").hidden &&
      !document.querySelector(".keys-overlay") && panels.every((id) => document.getElementById(id)?.hidden !== false);
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    dock.classList.toggle("command-armed", next === "armed");
    dock.classList.toggle("command-searching", next === "search");
    bar.hidden = !next;
    chooser.hidden = next !== "armed";
    searchRow.hidden = next !== "search";
    results.hidden = next !== "search";
  }
  function clearHighlight() {
    document.querySelectorAll("#feed .msg.find-active").forEach((el) => el.classList.remove("find-active", "find-arrived"));
    clearTimeout(flashTimer);
  }
  function close(restoreFocus = true) {
    if (!mode) return;
    clearTimeout(queryTimer);
    clearHighlight();
    setMode("");
    search.value = "";
    matches = []; selected = -1;
    if (restoreFocus && available()) input.focus();
  }
  function arm() {
    if (!available() || mode) return;
    setMode("armed");
    Sound.toolchuff();
  }
  function openSearch() {
    if (!available()) return;
    setMode("search");
    search.focus();
    updateMatches();
    Sound.found();
  }
  function snippet(text, at, length) {
    const start = Math.max(0, at - 42), end = Math.min(text.length, at + length + 42);
    const before = text.slice(start, at).replace(/\s+/g, " ");
    const word = text.slice(at, at + length);
    const after = text.slice(at + length, end).replace(/\s+/g, " ");
    return `${start ? "…" : ""}${escapeHtml(before)}<mark>${escapeHtml(word)}</mark>${escapeHtml(after)}${end < text.length ? "…" : ""}`;
  }
  function updateMatches() {
    if (mode !== "search") return;
    clearHighlight();
    matches = []; selected = -1;
    const term = search.value.trim().toLocaleLowerCase();
    if (term) {
      for (const body of feed.querySelectorAll(".msg.user .body, .msg.bot .answer")) {
        const message = body.closest(".msg"), content = body.textContent || "";
        const lower = content.toLocaleLowerCase();
        let from = 0, at;
        while ((at = lower.indexOf(term, from)) !== -1 && matches.length < 200) {
          matches.push({ message, preview: snippet(content, at, term.length), who: message.classList.contains("user") ? "YOU" : "UMBRA" });
          from = at + Math.max(1, term.length);
        }
        if (matches.length >= 200) break;
      }
    }
    count.textContent = `${matches.length}${matches.length === 200 ? "+" : ""} ${matches.length === 1 ? "MATCH" : "MATCHES"}`;
    list.innerHTML = !term ? '<p class="find-empty">Type a word or phrase to search this conversation.</p>'
      : !matches.length ? '<p class="find-empty">No matches in this conversation.</p>'
      : matches.map((m, i) => `<button type="button" class="find-result" data-index="${i}"><small>${m.who} · ${i + 1} / ${matches.length}</small><span>${m.preview}</span></button>`).join("");
  }
  function jump(index) {
    if (!matches.length) return;
    selected = (index + matches.length) % matches.length;
    const target = matches[selected].message;
    if (!target?.isConnected) { updateMatches(); return; }
    clearHighlight();
    target.classList.add("find-active");
    list.querySelectorAll(".find-result").forEach((button, i) => button.classList.toggle("on", i === selected));
    list.querySelector(`.find-result[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
    const a = target.getBoundingClientRect(), b = feed.getBoundingClientRect();
    feed.scrollTo({ top: Math.max(0, feed.scrollTop + a.top - b.top - Math.min(90, b.height * .22)), behavior: "smooth" });
    flashTimer = setTimeout(() => { if (target.isConnected) target.classList.add("find-arrived"); }, 420);
    Sound.hover();
  }
  function runCommand(command) {
    if (command === "search") { openSearch(); return; }
    close(false);
    if (command === "history") window.toggleHistory?.(true);
    if (command === "export") window.exportCurrent?.();
    if (command === "terminal") window.UmbraTerminal?.show();
  }

  document.addEventListener("keydown", (e) => {
    if (mode === "search" && e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation(); close(); return;
    }
    if (e.key === "Control" && !e.repeat && !e.altKey && !e.metaKey) { arm(); return; }
    if (mode === "armed" && e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") {
      e.preventDefault(); e.stopImmediatePropagation();
      close(false); window.focusHistorySearch?.(); return;
    }
    if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !available()) return;
    const key = e.key.toLowerCase();
    if (!["f", "h", "e"].includes(key)) return;
    if (key === "f" || mode === "armed") {
      e.preventDefault(); e.stopImmediatePropagation();
      runCommand({ f: "search", h: "history", e: "export" }[key]);
    }
  }, true);
  document.addEventListener("keyup", (e) => { if (e.key === "Control" && mode === "armed") close(false); }, true);
  window.addEventListener("blur", () => { if (mode === "armed") close(false); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "armed") close(false); });
  bar.addEventListener("click", (e) => { const button = e.target.closest("[data-command]"); if (button) runCommand(button.dataset.command); });
  bar.querySelector(".command-close").addEventListener("click", () => close());
  search.addEventListener("input", () => { clearTimeout(queryTimer); queryTimer = setTimeout(updateMatches, 80); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      jump(selected + (e.key === "ArrowUp" ? -1 : 1));
    }
  });
  list.addEventListener("click", (e) => { const row = e.target.closest(".find-result"); if (row) jump(Number(row.dataset.index)); });
  results.querySelector(".find-prev").addEventListener("click", () => jump(selected - 1));
  results.querySelector(".find-next").addEventListener("click", () => jump(selected + 1));
  results.querySelector(".find-bottom").addEventListener("click", () => {
    close(false);
    feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
    input.focus();
  });
  new MutationObserver(() => { if (mode === "search" && search.value.trim()) { clearTimeout(queryTimer); queryTimer = setTimeout(updateMatches, 120); } })
    .observe(feed, { childList: true, characterData: true, subtree: true });
  setInterval(() => { if (mode && !available()) close(false); }, 300);
})();
