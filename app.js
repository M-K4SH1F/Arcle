(function () {
"use strict";
const E = createEngine(RAW);
const DAY_MS = 86400000;
const PROMPT_MS = 30000;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TIER_KEYS = ["cold", "warm", "close", "bullseye"];
const TILE_GLYPH = { cold: "", warm: "", close: "", bullseye: "★", miss: "✕" };
const TIER_RANGE = { bullseye: "100", close: "60–90", warm: "35–59", cold: "0–34", miss: "0" };

// ---------- Storage (all access wrapped so the page works without it) ----------
const KEY = "arcle:v2";
const blankMode = () => ({ played: 0, total: 0, cur: 0, best: 0, last: null });
const fresh = () => ({ v: 2, days: {}, archive: {}, stats: { easy: blankMode(), hard: blankMode(), bullseyes: 0, hardest: null }, theme: null, mode: "easy", testDate: null });
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) return Object.assign(fresh(), s); } catch (e) {}
  return fresh();
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// ---------- Dates ----------
const utcToday = () => new Date().toISOString().slice(0, 10);
function urlTestDate() {
  let d = null;
  try { d = new URLSearchParams(location.search).get("date"); } catch (e) {}
  if (!d) { const m = (location.hash || "").match(/^#date-(\d{4}-\d{2}-\d{2})$/); if (m) d = m[1]; }
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(E.parseDate(d)) ? d : null;
}
const URL_DATE = urlTestDate();
const testDate = () => URL_DATE || S.testDate || null;
const today = () => testDate() || utcToday();
const addDays = (d, n) => E.fmtDate(E.parseDate(d) + n * DAY_MS);
const niceDate = d => new Date(E.parseDate(d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const shortDate = d => new Date(E.parseDate(d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
function msToNextReset() { const now = Date.now(); return Math.ceil((now + 1) / DAY_MS) * DAY_MS - now; }
function hms(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":"); }
const fmtPop = p => p >= 1e6 ? (p / 1e6).toFixed(1) + "M" : Math.round(p / 1000) + "k";

// ---------- Theme ----------
function applyTheme() {
  const t = S.theme || "dark";
  document.documentElement.dataset.theme = t;
  $("theme-btn").setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode");
}
$("theme-btn").addEventListener("click", () => { S.theme = (S.theme || "dark") === "dark" ? "light" : "dark"; save(); applyTheme(); });

// ---------- Screens ----------
const SCREENS = ["home", "play", "results", "stats", "help", "archive"];
let screen = "home";
let homeTimer = null;
function show(name) {
  screen = name;
  for (const s of SCREENS) $("scr-" + s).hidden = s !== name;
  document.querySelectorAll("[data-go]").forEach(b => { if (b.dataset.go === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (name !== "play") stopTimer();
  clearInterval(homeTimer);
  window.scrollTo(0, 0);
}
function go(name) {
  if (name === "home") renderHome();
  if (name === "stats") renderStats();
  if (name === "help") renderHelp();
  if (name === "archive") renderArchive();
}
$("go-home").addEventListener("click", () => go("home"));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

function renderBanner() {
  const t = testDate();
  $("test-banner").hidden = !t;
  if (t) {
    $("test-banner-text").textContent = `Test date: ${t} (puzzle #${E.puzzleNumber(t)})`;
    $("test-clear-banner").hidden = !!URL_DATE && !S.testDate;
  }
}
$("test-clear-banner").addEventListener("click", () => {
  S.testDate = null; save();
  if (URL_DATE) { try { location.hash = ""; location.search = ""; } catch (e) {} }
  renderBanner(); go("home");
});

// ---------- Records ----------
const newRec = mode => ({ mode, results: [], guesses: [[], [], [], [], []], current: null, done: false, counted: false });
const recScore = rec => rec.results.reduce((s, r) => s + (r ? r.pts : 0), 0);
function streakNow(mode) {
  const m = S.stats[mode], t = today();
  return m.last === t || m.last === addDays(t, -1) ? m.cur : 0;
}

// ---------- Tiles ----------
function tileHTML(r, small) {
  const cls = small ? "tile sm" : "tile";
  if (!r) return `<span class="${cls} empty"></span>`;
  return `<span class="${cls} tc-${r.tier}" title="${E.TIERS[r.tier].name}">${TILE_GLYPH[r.tier]}</span>`;
}
const tilesHTML = (rec, small, nowIdx) => [0, 1, 2, 3, 4].map(i => {
  const h = tileHTML(rec.results[i], small);
  return i === nowIdx && !rec.results[i] ? h.replace("empty", "empty now") : h;
}).join("");

// ---------- Home ----------
function renderHome() {
  show("home");
  renderBanner();
  const t = today();
  const n = E.puzzleNumber(t);
  const el = $("scr-home");
  if (n < 1) {
    el.innerHTML = `
      <div class="hero">
        <span class="eyebrow">Daily anime guessing game</span>
        <div class="big-num">#1</div>
        <p class="lede">The first Arcle puzzle goes live on ${niceDate(E.EPOCH)} at 00:00 UTC.</p>
      </div>
      <div class="countdown"><span>Puzzle #1 starts in</span><b class="mono" id="cd">${hms(E.parseDate(E.EPOCH) - Date.now())}</b></div>
      <button class="btn ghost wide" id="preview-btn">Preview puzzle #1 (doesn't count)</button>
      ${legendHTML()}`;
    $("preview-btn").addEventListener("click", () => startGame(E.EPOCH, "archive", S.mode || "easy"));
    homeTimer = setInterval(() => { const ms = E.parseDate(E.EPOCH) - Date.now(); if (ms <= 0 && !testDate()) renderHome(); else $("cd").textContent = hms(ms); }, 1000);
    return;
  }
  const rec = S.days[t];
  const started = rec && (rec.results.length || rec.current);
  const mode = rec ? rec.mode : (S.mode || "easy");
  const locked = !!rec;
  let action;
  if (rec && rec.done) {
    action = `<div class="countdown"><span>Today: ${recScore(rec)} / 500</span><span class="tiles">${tilesHTML(rec, true)}</span></div>
      <button class="btn wide" id="act">See today's results</button>`;
  } else if (started) {
    action = `<button class="btn wide" id="act">Continue: prompt ${Math.min(rec.results.length + 1, 5)} of 5</button>`;
  } else {
    action = `<button class="btn wide" id="act">Play #${n}</button>`;
  }
  el.innerHTML = `
    <div class="hero">
      <span class="eyebrow">${niceDate(t)}</span>
      <div class="big-num"><span>#</span>${n}</div>
      <p class="lede">Five hidden anime to find. One guess each, thirty seconds per guess. The closer your guess, the more it scores.</p>
    </div>
    <div class="modes" role="group" aria-label="Mode">
      <button class="mode" data-mode="easy" aria-pressed="${mode === "easy"}" ${locked ? "disabled" : ""}><strong>Easy</strong><small>See every clue.</small></button>
      <button class="mode" data-mode="hard" aria-pressed="${mode === "hard"}" ${locked ? "disabled" : ""}><strong>Hard</strong><small>One clue fewer per prompt.</small></button>
    </div>
    ${locked ? `<p class="note">Today is locked to ${mode === "hard" ? "Hard" : "Easy"} mode.</p>` : ""}
    ${action}
    <div class="countdown"><span>Next puzzle in</span><b class="mono" id="cd">${hms(msToNextReset())}</b></div>
    ${legendHTML()}`;
  el.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
    S.mode = b.dataset.mode; save();
    el.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b));
  }));
  $("act").addEventListener("click", () => {
    if (rec && rec.done) showResults(t, "daily");
    else startGame(t, "daily", S.mode || "easy");
  });
  const startDay = utcToday();
  homeTimer = setInterval(() => {
    if (!testDate() && utcToday() !== startDay) return renderHome();
    const c = $("cd"); if (c) c.textContent = hms(msToNextReset());
  }, 1000);
}
function legendHTML() {
  return `<div class="legend" aria-label="Tiers">${TIER_KEYS.map(k => `<div>${tileHTML({ tier: k }, true)}<span>${E.TIERS[k].name}</span><b>${TIER_RANGE[k]}</b></div>`).join("")}</div>`;
}

// ---------- Game ----------
let G = null; // { date, kind, rec, day }
let timerId = null;

function startGame(date, kind, mode) {
  const day = E.getDay(date);
  if (!day) return;
  const store = kind === "daily" ? S.days : S.archive;
  if (!store[date]) store[date] = newRec(mode);
  if (kind === "archive" && store[date].done) store[date] = newRec(mode);
  save();
  G = { date, kind, rec: store[date], day };
  if (G.rec.done) return showResults(date, kind);
  show("play");
  renderPlay();
}

function curIdx() { return Math.min(G.rec.results.length, 4); }

function renderPlay() {
  const rec = G.rec;
  const i = rec.results.length;
  $("p-mode").textContent = rec.mode === "hard" ? "Hard" : "Easy";
  $("p-mode").className = "chip" + (rec.mode === "hard" ? " hard" : "");
  $("p-score").innerHTML = `${recScore(rec)}<small>pts</small>`;
  $("p-tiles").innerHTML = tilesHTML(rec, false, i);
  if (i >= 5) return finishGame();
  $("p-num").textContent = `Prompt ${i + 1} / 5` + (G.kind === "archive" ? ` · Archive #${G.day.number}` : "");
  if (!rec.current || rec.current.idx !== i) {
    // Prompt not shown yet. On a fresh start show it right away; after a reload, wait for a tap.
    if (G.resume) {
      $("p-ready").hidden = false; $("p-live").hidden = true;
      $("p-ready").innerHTML = `<h2>Prompt ${i + 1} is ready</h2><p class="note">The 30-second timer starts when the prompt appears.</p><button class="btn wide" id="ready-btn">Show prompt ${i + 1}</button>`;
      $("ready-btn").addEventListener("click", () => { G.resume = false; renderPlay(); });
      return;
    }
    rec.current = { idx: i, startedAt: Date.now() };
    save();
  }
  G.resume = false;
  $("p-ready").hidden = true; $("p-live").hidden = false;
  const p = G.day.prompts[i];
  const clues = E.cluesForMode(p, rec.mode);
  $("p-text").innerHTML = clues.map(c => `<span class="clue">${esc(c.chip)}</span>`).join("");
  $("p-meta").textContent = `${E.fitting(clues).length} anime in the Arcle list fit these clues`;
  $("p-resolve").hidden = true;
  $("p-input-area").hidden = false;
  $("guess-input").value = "";
  closeSugs();
  renderFeed();
  startTimer();
  setTimeout(() => $("guess-input").focus({ preventScroll: true }), 30);
}

function renderFeed() {
  const i = G.rec.results.length;
  const lines = (G.rec.guesses[Math.min(i, 4)] || []).slice().reverse();
  $("p-feed").innerHTML = lines.map(g => `<li class="${g.info ? "info" : ""}">${esc(g.text)}</li>`).join("");
}

function startTimer() {
  stopTimer();
  const tick = () => {
    const cur = G && G.rec.current;
    if (!cur) return stopTimer();
    const left = PROMPT_MS - (Date.now() - cur.startedAt);
    const frac = Math.max(0, left / PROMPT_MS);
    $("p-timer-fill").style.width = (frac * 100) + "%";
    $("p-timer-num").textContent = Math.max(0, Math.ceil(left / 1000));
    $("p-timer").classList.toggle("low", left < 10000);
    if (left <= 0) { stopTimer(); resolveMiss(); }
  };
  tick();
  timerId = setInterval(tick, 100);
}
function stopTimer() { clearInterval(timerId); timerId = null; }

function submitGuess(anime) {
  const rec = G.rec, i = rec.results.length;
  if (!rec.current || rec.current.idx !== i || i >= 5) return;
  if (Date.now() - rec.current.startedAt >= PROMPT_MS) { stopTimer(); return resolveMiss(); }
  const p = G.day.prompts[i];
  const cmp = E.compare(anime, E.BY_ID.get(p.mysteryId));
  const line = `${anime.english} — ${E.TIERS[cmp.tier].name.toUpperCase()} ${E.TIERS[cmp.tier].sq} +${cmp.score}`;
  rec.results[i] = { id: anime.id, tier: cmp.tier, pts: cmp.score, line };
  rec.current = null;
  save();
  stopTimer();
  showResolution(i);
}

function resolveMiss() {
  const rec = G.rec, i = rec.results.length;
  if (i >= 5 || !rec.current) return;
  rec.results[i] = { id: null, tier: "miss", pts: 0 };
  rec.current = null;
  save();
  showResolution(i);
}

function showResolution(i) {
  const r = G.rec.results[i], p = G.day.prompts[i];
  $("p-input-area").hidden = true; closeSugs();
  $("p-score").innerHTML = `${recScore(G.rec)}<small>pts</small>`;
  $("p-tiles").innerHTML = tilesHTML(G.rec, false, -1);
  $("p-timer-fill").style.width = "0%";
  const last = i === 4;
  const mystery = E.BY_ID.get(p.mysteryId);
  let body;
  if (r.tier === "miss") {
    body = `<div class="resolve-top">${tileHTML(r)}<div><div class="resolve-tier txt-miss">Miss</div><span class="note">Time ran out · +0</span></div></div>
      <p class="reveal">The answer was <b>${esc(mystery.english)}</b>.</p>`;
  } else {
    const guess = E.BY_ID.get(r.id);
    body = `<div class="resolve-top">${tileHTML(r)}<div><div class="resolve-tier txt-${r.tier}">${E.TIERS[r.tier].name}</div><span class="note">+${r.pts} points</span></div></div>
      <p class="resolve-line">${esc(r.line)}</p>
      ${r.tier === "bullseye" ? `<p class="reveal">You found it: <b>${esc(mystery.english)}</b>.</p>` : `<p class="reveal">The answer was <b>${esc(mystery.english)}</b>.</p>${cmpTable(guess, mystery)}`}`;
  }
  $("p-resolve").innerHTML = body + `<button class="btn wide" id="next-btn">${last ? "See results" : `Next prompt (${i + 2}/5)`}</button>`;
  $("p-resolve").hidden = false;
  $("p-feed").innerHTML = "";
  $("next-btn").addEventListener("click", () => renderPlay());
  $("next-btn").focus({ preventScroll: true });
}

function cmpTable(guess, mystery) {
  const cmp = E.compare(guess, mystery);
  return `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th><th>Your guess</th><th>Answer</th><th>Pts</th></tr></thead><tbody>${cmp.rows.map(row => {
    const cls = row.pts === row.max ? "full" : row.pts > 0 ? "part" : "none";
    return `<tr class="${cls}"><td>${row.attr}</td><td>${esc(row.guess)}</td><td>${esc(row.target)}${row.hint ? ` <span class="hint">${esc(row.hint)}</span>` : ""}</td><td class="mono">${row.pts}/${row.max}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function finishGame() {
  const rec = G.rec;
  if (!rec.done) {
    rec.done = true;
    if (G.kind === "daily" && !rec.counted) {
      rec.counted = true;
      const m = S.stats[rec.mode];
      m.played++; m.total += recScore(rec);
      m.cur = m.last === addDays(G.date, -1) ? m.cur + 1 : 1;
      m.last = G.date;
      m.best = Math.max(m.best, m.cur);
      rec.results.forEach((r, i) => {
        if (r.tier !== "bullseye") return;
        S.stats.bullseyes++;
        const id = G.day.prompts[i].mysteryId, rank = E.RANK.get(id);
        if (!S.stats.hardest || rank > S.stats.hardest.rank) S.stats.hardest = { id, rank, date: G.date };
      });
    }
    save();
  }
  showResults(G.date, G.kind);
}

// ---------- Autocomplete ----------
const norm = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const INDEX = E.ANIME.map(a => {
  const keys = [a.english, a.romaji, ...a.short].map(norm).filter(Boolean);
  return { a, keys, compact: keys.map(k => k.replace(/ /g, "")) };
});
function suggest(q) {
  const nq = norm(q); if (!nq) return [];
  const cq = nq.replace(/ /g, "");
  const out = [];
  for (const it of INDEX) {
    let best = 9;
    it.keys.forEach((k, j) => {
      const kc = it.compact[j];
      let s = 9;
      if (k === nq || kc === cq) s = 0;
      else if (kc.startsWith(cq)) s = 1;
      else if ((" " + k).includes(" " + nq)) s = 2;
      else if (cq.length >= 3 && kc.includes(cq)) s = 3;
      if (s < best) best = s;
    });
    if (best < 9) out.push({ a: it.a, s: best });
  }
  out.sort((x, y) => x.s - y.s || y.a.popularity - x.a.popularity);
  return out.slice(0, 7).map(x => x.a);
}
let sugs = [], sel = 0;
function renderSugs() {
  const list = $("sug-list"), input = $("guess-input");
  const q = input.value.trim();
  if (!q) return closeSugs();
  list.hidden = false; $("p-guess").classList.add("open"); input.setAttribute("aria-expanded", "true");
  if (!sugs.length) { list.innerHTML = `<li class="none">No match in the Arcle list. Try another spelling or the romaji title.</li>`; return; }
  list.innerHTML = sugs.map((a, j) => {
    const ro = a.romaji !== a.english ? `<span class="ro">${esc(a.romaji)}</span>` : "";
    return `<li role="option" id="sug-${j}" data-j="${j}" aria-selected="${j === sel}"><div><span class="en">${esc(a.english)}</span>${ro}</div></li>`;
  }).join("");
  input.setAttribute("aria-activedescendant", "sug-" + sel);
}
function closeSugs() {
  sugs = []; sel = 0;
  $("sug-list").hidden = true; $("sug-list").innerHTML = "";
  $("p-guess").classList.remove("open");
  $("guess-input").setAttribute("aria-expanded", "false");
}
function pick(j) {
  const a = sugs[j]; if (!a) return;
  $("guess-input").value = "";
  closeSugs();
  submitGuess(a);
}
$("guess-input").addEventListener("input", e => { sugs = suggest(e.target.value); sel = 0; renderSugs(); });
$("guess-input").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" && sugs.length) { sel = (sel + 1) % sugs.length; renderSugs(); e.preventDefault(); }
  else if (e.key === "ArrowUp" && sugs.length) { sel = (sel - 1 + sugs.length) % sugs.length; renderSugs(); e.preventDefault(); }
  else if (e.key === "Enter") { e.preventDefault(); if (sugs.length) pick(sel); }
  else if (e.key === "Escape") closeSugs();
});
$("sug-list").addEventListener("mousedown", e => {
  const li = e.target.closest("li[data-j]"); if (!li) return;
  e.preventDefault(); pick(+li.dataset.j);
});

// ---------- Results ----------
function shareText(rec, day, kind) {
  const head = `Arcle #${day.number} 🎌${rec.mode === "hard" ? " Hard" : ""}`;
  const sq = rec.results.map(r => E.TIERS[r.tier].sq).join("");
  const tail = kind === "daily" ? `${recScore(rec)} pts · streak ${streakNow(rec.mode)}🔥` : `${recScore(rec)} pts · archive`;
  return `${head}\n${sq}\n${tail}`;
}
function showResults(date, kind) {
  show("results");
  renderBanner();
  const rec = (kind === "daily" ? S.days : S.archive)[date];
  const day = E.getDay(date);
  const score = recScore(rec);
  const text = shareText(rec, day, kind);
  const items = day.prompts.map((p, i) => {
    const r = rec.results[i];
    const a = r && r.id ? E.BY_ID.get(r.id) : null;
    const m = E.BY_ID.get(p.mysteryId);
    return `<div class="res-item">
      <p class="q">${i + 1}. ${E.cluesForMode(p, rec.mode).map(c => esc(c.chip)).join(" · ")}</p>
      <div class="a">${tileHTML(r, true)}<span>${a ? esc(a.english) : "No guess"}</span><span class="pts txt-${r.tier}">${E.TIERS[r.tier].name} +${r.pts}</span></div>
      <div class="rarest"><div><span>Answer: <b>${esc(m.english)}</b></span><span>${m.year} · ${esc(m.studios[0])}</span></div></div>
    </div>`;
  }).join("");
  $("scr-results").innerHTML = `
    <div class="res-head">
      <div><span class="eyebrow">Arcle #${day.number} · ${rec.mode === "hard" ? "Hard" : "Easy"}${kind === "archive" ? " · Archive" : ""}</span>
      <div class="res-score">${score}<small> / 500</small></div></div>
      <div class="tiles">${tilesHTML(rec, false, -1)}</div>
    </div>
    ${kind === "archive" ? `<p class="note">Archive games don't count toward streaks or stats.</p>` : ""}
    <pre class="share-preview" id="share-text">${esc(text)}</pre>
    <div class="share-row">
      <button class="btn" id="share-btn">Share result</button>
      <button class="btn ghost" id="res-home">${kind === "archive" ? "Back to archive" : "Home"}</button>
    </div>
    <p class="toast" id="toast" aria-live="polite"></p>
    <div class="res-list">${items}</div>`;
  $("share-btn").addEventListener("click", () => copyShare(text));
  $("res-home").addEventListener("click", () => go(kind === "archive" ? "archive" : "home"));
}
function copyShare(text) {
  const done = () => { $("toast").textContent = "Copied to clipboard."; };
  const fallback = () => {
    $("toast").innerHTML = `Copy didn't work here. Select the text below and copy it.<textarea class="share-fallback" id="share-fb" rows="3" readonly></textarea>`;
    const ta = $("share-fb"); ta.value = text; ta.focus(); ta.select();
  };
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
}

// ---------- Stats ----------
function renderStats() {
  show("stats");
  const st = S.stats;
  const row = (label, f) => `<tr><td>${label}</td><td>${f(st.easy, "easy")}</td><td>${f(st.hard, "hard")}</td></tr>`;
  const avg = m => m.played ? Math.round(m.total / m.played) : "–";
  const hb = st.hardest ? E.BY_ID.get(st.hardest.id) : null;
  $("scr-stats").innerHTML = `
    <h2>Stats</h2>
    <div class="tier-table-wrap"><table class="stat-table">
      <thead><tr><th></th><th>Easy</th><th>Hard</th></tr></thead>
      <tbody>
        ${row("Games played", m => m.played)}
        ${row("Current streak", (m, k) => streakNow(k))}
        ${row("Best streak", m => m.best)}
        ${row("Average score", avg)}
      </tbody></table></div>
    <div class="stat-pair">
      <div class="stat-box"><span class="eyebrow">Bullseyes</span><b class="txt-bullseye">${st.bullseyes}</b></div>
      <div class="stat-box"><span class="eyebrow">Hardest bullseye</span>${hb ? `<span class="t">${esc(hb.english)}</span><span class="note">~${fmtPop(hb.popularity)} members · #${E.puzzleNumber(st.hardest.date)}</span>` : `<span class="note">Name a hidden anime exactly to set one.</span>`}</div>
    </div>
    <p class="note">Only daily puzzles count. Archive games and previews don't change these numbers.</p>
    <div class="danger-zone" id="reset-zone"><button class="btn small danger" id="reset-btn">Reset all data</button></div>`;
  $("reset-btn").addEventListener("click", () => {
    $("reset-zone").innerHTML = `<span class="note">Delete all streaks, stats and saved games on this device?</span>
      <button class="btn small danger" id="reset-yes">Delete everything</button><button class="btn small ghost" id="reset-no">Keep my data</button>`;
    $("reset-yes").addEventListener("click", () => { const th = S.theme; S = fresh(); S.theme = th; save(); renderStats(); });
    $("reset-no").addEventListener("click", renderStats);
  });
}

// ---------- How to play ----------
function renderHelp() {
  show("help");
  const rows = [["bullseye", "You named the hidden anime exactly"], ["close", "Very close: shares most details"], ["warm", "Fits the clues, but differs in places"], ["cold", "Far off"], ["miss", "No guess before time ran out"]];
  $("scr-help").innerHTML = `
    <h2>How to play</h2>
    <ol class="rules">
      <li>Each day has 5 hidden anime to find. Everyone gets the same ones.</li>
      <li>Each prompt shows a few clues, like genre, studio, decade, source or episode count. No plot details.</li>
      <li>You get one guess per prompt and 30 seconds to make it. Pick a title from the list and it locks in.</li>
      <li>A guess scores up to 90 points for how close it is: year (20), genres (20), episodes (15), studio (15), source (10) and format (10). Naming the exact anime scores 100.</li>
      <li>Prompts get harder through the day: later answers are less well known, and their clues fit more anime.</li>
      <li>Hard mode shows one clue fewer per prompt. Easy and Hard keep separate streaks. Pick a mode before you start; it stays fixed for the day.</li>
      <li>A new puzzle arrives at 00:00 UTC. The last 7 days are in the archive, for practice.</li>
    </ol>
    <div class="tier-table-wrap"><table class="tier-table">
      <thead><tr><th>Tier</th><th>Points</th><th>Meaning</th></tr></thead>
      <tbody>${rows.map(([k, rule]) => `<tr><td><span style="display:flex;gap:8px;align-items:center">${tileHTML({ tier: k }, true)}${E.TIERS[k].name}</span></td><td class="pts">${TIER_RANGE[k]}</td><td>${rule}</td></tr>`).join("")}</tbody>
    </table></div>
    <h3>Example</h3>
    <div class="example-line">Clues: Sports · From a manga · 2010s · 2–13 episodes</div>
    <div class="example-line">Haikyu!! — WARM 🟦 +52 · The answer was Ping Pong the Animation</div>
    <div class="tools">
      <h3>Prototype testing</h3>
      <p class="note">Load any day's puzzle as if it were today. It counts for stats like a normal day, so reset data after testing. You can also add <span class="mono">?date=2026-10-25</span> to the file's URL, or <span class="mono">#date-2026-10-25</span> to the artifact link.</p>
      <div class="row"><input type="date" id="test-date" aria-label="Test date" min="${E.EPOCH}" value="${testDate() || ""}"><button class="btn small" id="test-load">Load this date</button><button class="btn small ghost" id="test-clear">Use real date</button></div>
    </div>`;
  $("test-load").addEventListener("click", () => {
    const v = $("test-date").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || E.puzzleNumber(v) < 1) { $("test-date").focus(); return; }
    S.testDate = v; save(); go("home");
  });
  $("test-clear").addEventListener("click", () => { S.testDate = null; save(); go("home"); });
}

// ---------- Archive ----------
function renderArchive() {
  show("archive");
  const t = today();
  const days = [];
  for (let k = 1; k <= 7; k++) { const d = addDays(t, -k); if (E.puzzleNumber(d) >= 1) days.push(d); }
  const items = days.map(d => {
    const rec = S.archive[d];
    const status = rec && rec.done ? `<span class="tiles">${tilesHTML(rec, true)}</span><span>${recScore(rec)} pts · ${rec.mode === "hard" ? "Hard" : "Easy"}</span>`
      : rec && rec.results.length ? `<span>In progress: ${rec.results.length} / 5</span>` : `<span>Not played</span>`;
    const label = rec && rec.done ? "View" : rec && rec.results.length ? "Continue" : "Play";
    return `<div class="arch-item"><div class="info"><strong>#${E.puzzleNumber(d)} · ${shortDate(d)}</strong>${status}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${rec && rec.done ? `<button class="btn small ghost" data-replay="${d}">Replay</button>` : ""}
        <button class="btn small" data-arch="${d}">${label}</button></div></div>`;
  }).join("");
  $("scr-archive").innerHTML = `
    <h2>Archive</h2>
    <p class="note">Play the last 7 days for practice. Archive games don't count toward streaks or stats.</p>
    ${days.length ? `<div class="modes" role="group" aria-label="Archive mode">
      <button class="mode" data-amode="easy" aria-pressed="${(S.mode || "easy") === "easy"}"><strong>Easy</strong><small>See every clue.</small></button>
      <button class="mode" data-amode="hard" aria-pressed="${S.mode === "hard"}"><strong>Hard</strong><small>One clue fewer per prompt.</small></button></div>
      <div class="arch-list">${items}</div>`
    : `<p class="note">Nothing here yet. The archive fills up as days pass after puzzle #1 on ${niceDate(E.EPOCH)}.</p>`}`;
  $("scr-archive").querySelectorAll("[data-amode]").forEach(b => b.addEventListener("click", () => {
    S.mode = b.dataset.amode; save();
    $("scr-archive").querySelectorAll("[data-amode]").forEach(x => x.setAttribute("aria-pressed", x === b));
  }));
  $("scr-archive").querySelectorAll("[data-arch]").forEach(b => b.addEventListener("click", () => {
    const d = b.dataset.arch, rec = S.archive[d];
    if (rec && rec.done) return showResults(d, "archive");
    startGame(d, "archive", S.mode || "easy");
  }));
  $("scr-archive").querySelectorAll("[data-replay]").forEach(b => b.addEventListener("click", () => {
    const d = b.dataset.replay; delete S.archive[d]; save(); startGame(d, "archive", S.mode || "easy");
  }));
}

// ---------- Boot ----------
$("f-count").textContent = E.ANIME.length;
applyTheme();
renderBanner();
(function boot() {
  const t = today();
  const rec = S.days[t];
  if (E.puzzleNumber(t) >= 1 && rec && !rec.done && (rec.results.length || rec.current)) {
    G = { date: t, kind: "daily", rec, day: E.getDay(t), resume: true };
    show("play");
    // A prompt that was already on screen keeps its original start time; the timer is not reset by reloading.
    if (rec.current && rec.current.idx === rec.results.length) G.resume = false;
    renderPlay();
    return;
  }
  renderHome();
})();
window.__arcle = { E, get S() { return S; }, get G() { return G; } };
})();
