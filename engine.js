// Arcle puzzle engine: each prompt hides one mystery anime. Players get one guess, scored by how close it is.
function createEngine(RAW) {
  const SEASONS = { W: "Winter", Sp: "Spring", Su: "Summer", F: "Fall" };
  const SOURCES = { M: "Manga", LN: "Light Novel", O: "Original", VN: "Visual Novel", N: "Novel", G: "Video Game", X: "Other" };
  const EPOCH = "2026-10-19";
  const DAY_MS = 86400000;
  const NO_REPEAT_DAYS = 30;

  const ANIME = RAW.map((r, i) => ({
    id: i + 1,
    english: r[0],
    romaji: r[1],
    short: r[2] ? r[2].split("|") : [],
    year: r[3],
    season: SEASONS[r[4]],
    format: r[5],
    source: SOURCES[r[6]],
    origin: r[11] === "WN" ? "Web Novel" : null,
    studios: r[7].split("|"),
    genres: r[8].split("|"),
    episodes: r[9],
    popularity: r[10] * 1000,
  }));
  const BY_ID = new Map(ANIME.map(a => [a.id, a]));
  const byPop = ANIME.slice().sort((a, b) => b.popularity - a.popularity || a.id - b.id);
  const RANK = new Map(byPop.map((a, i) => [a.id, i + 1]));

  // Slot difficulty: which popularity ranks the mystery comes from, how many clues Easy mode shows,
  // and how many anime in the list may fit all Easy clues (fewer = easier to hit exactly).
  const SLOTS = [
    { ranks: [1, 65], clues: 4, fit: [2, 5] },
    { ranks: [15, 100], clues: 4, fit: [3, 7] },
    { ranks: [20, 130], clues: 4, fit: [4, 8] },
    { ranks: [40, 170], clues: 3, fit: [5, 11] },
    { ranks: [70, 999], clues: 3, fit: [6, 14] },
  ];

  // ---------- Clues ----------
  const EP_RANGES = [[2, 13], [14, 26], [27, 60], [61, 99999]];
  const SOURCE_CHIP = { "Manga": "From a manga", "Light Novel": "From a light novel", "Original": "Original story",
    "Visual Novel": "From a visual novel", "Novel": "From a novel", "Video Game": "From a video game", "Other": "Other source" };
  const FORMAT_CHIP = { TV: "TV series", Movie: "Film", OVA: "OVA", ONA: "ONA (web release)" };
  const decadeOf = a => Math.floor(a.year / 10) * 10;
  const epRangeOf = a => a.format === "Movie" ? null : EP_RANGES.find(([lo, hi]) => a.episodes >= lo && a.episodes <= hi);
  const epChip = ([lo, hi]) => hi > 9999 ? `${lo}+ episodes` : `${lo}–${hi} episodes`;

  function cluesFor(a) {
    const out = [];
    for (const g of a.genres) if (g !== "Ecchi") out.push({ key: "g:" + g, type: "genre", chip: g, test: x => x.genres.includes(g) });
    out.push({ key: "s:" + a.source, type: "source", chip: SOURCE_CHIP[a.source], test: x => x.source === a.source });
    if (a.origin) out.push({ key: "wn", type: "source", chip: "Began as a web novel", test: x => x.origin === "Web Novel" });
    out.push({ key: "st:" + a.studios[0], type: "studio", chip: "Studio: " + a.studios[0], test: x => x.studios.includes(a.studios[0]) });
    const d = decadeOf(a);
    out.push({ key: "d:" + d, type: "decade", chip: d + "s", test: x => decadeOf(x) === d });
    if (a.format !== "TV") out.push({ key: "f:" + a.format, type: "format", chip: FORMAT_CHIP[a.format], test: x => x.format === a.format });
    const er = epRangeOf(a);
    if (er) out.push({ key: "e:" + er[0], type: "eps", chip: epChip(er), test: x => { const r = epRangeOf(x); return !!r && r[0] === er[0]; } });
    return out;
  }
  const fitting = clues => ANIME.filter(x => clues.every(c => c.test(x)));

  // ---------- Closeness scoring ----------
  const TIERS = {
    bullseye: { name: "Bullseye", pts: 100, sq: "🌟", min: 100 },
    close: { name: "Close", sq: "🟪", min: 60 },
    warm: { name: "Warm", sq: "🟦", min: 35 },
    cold: { name: "Cold", sq: "⬜", min: 0 },
    miss: { name: "Miss", pts: 0, sq: "⬛" },
  };
  const tierFor = score => score >= 100 ? "bullseye" : score >= 60 ? "close" : score >= 35 ? "warm" : "cold";

  function compare(guess, target) {
    const rows = [];
    // Year: 20, minus 4 per year apart.
    const dy = target.year - guess.year;
    rows.push({ attr: "Year", guess: String(guess.year), target: String(target.year), max: 20,
      pts: Math.max(0, 20 - 4 * Math.abs(dy)), hint: dy > 0 ? "↑ newer" : dy < 0 ? "↓ older" : "" });
    // Genres: 20 × shared / combined.
    const gSet = new Set(guess.genres), shared = target.genres.filter(g => gSet.has(g));
    const union = new Set([...guess.genres, ...target.genres]).size;
    rows.push({ attr: "Genres", guess: guess.genres.join(", "), target: target.genres.join(", "), max: 20,
      pts: Math.round(20 * shared.length / union), hint: `${shared.length} shared` });
    // Episodes: 15, by ratio. Films only match films.
    let ep = 0, epHint = "";
    if (guess.format === "Movie" || target.format === "Movie") ep = guess.format === target.format ? 15 : 0;
    else {
      const r = Math.min(guess.episodes, target.episodes) / Math.max(guess.episodes, target.episodes);
      ep = Math.round(15 * Math.pow(r, 0.7));
      epHint = target.episodes > guess.episodes ? "↑ more" : target.episodes < guess.episodes ? "↓ fewer" : "";
    }
    const epText = a => a.format === "Movie" ? "Film" : String(a.episodes);
    rows.push({ attr: "Episodes", guess: epText(guess), target: epText(target), max: 15, pts: ep, hint: epHint });
    const sharesStudio = guess.studios.some(s => target.studios.includes(s));
    rows.push({ attr: "Studio", guess: guess.studios.join(", "), target: target.studios.join(", "), max: 15, pts: sharesStudio ? 15 : 0, hint: "" });
    rows.push({ attr: "Source", guess: guess.source, target: target.source, max: 10, pts: guess.source === target.source ? 10 : 0, hint: "" });
    rows.push({ attr: "Format", guess: FORMAT_CHIP[guess.format], target: FORMAT_CHIP[target.format], max: 10, pts: guess.format === target.format ? 10 : 0, hint: "" });
    const exact = guess.id === target.id;
    const score = exact ? 100 : Math.min(90, rows.reduce((s, r) => s + r.pts, 0));
    return { exact, score, tier: tierFor(score), rows };
  }

  // ---------- Dates & RNG ----------
  const parseDate = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const fmtDate = ms => new Date(ms).toISOString().slice(0, 10);
  const EPOCH_MS = parseDate(EPOCH);
  const puzzleNumber = dateStr => Math.round((parseDate(dateStr) - EPOCH_MS) / DAY_MS) + 1;
  const dateForNumber = n => fmtDate(EPOCH_MS + (n - 1) * DAY_MS);
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Pick a clue set for a mystery: Easy shows all of them, Hard drops the last one.
  // A set is accepted if the number of anime fitting all Easy clues is inside the slot's range,
  // and no single clue type appears twice except genres.
  function pickClues(a, slot, rng) {
    const all = cluesFor(a);
    for (let tries = 0; tries < 120; tries++) {
      const set = [];
      const types = new Set();
      for (const c of shuffle(all, rng)) {
        if (c.type !== "genre" && types.has(c.type)) continue;
        if (c.type === "genre" && set.filter(x => x.type === "genre").length >= 2) continue;
        set.push(c); types.add(c.type);
        if (set.length === slot.clues) break;
      }
      if (set.length < slot.clues) continue;
      const fit = fitting(set).length;
      if (fit < slot.fit[0] || fit > slot.fit[1]) continue;
      // Order clues broadest first. Hard mode drops the last one, which is the most telling clue.
      set.sort((x, y) => fitting([x]).length - fitting([y]).length).reverse();
      const fitHard = fitting(set.slice(0, -1)).length;
      if (fitHard <= fit || fitHard > slot.fit[1] * 4) continue;
      return { clues: set, fitEasy: fit, fitHard };
    }
    return null;
  }

  const dayCache = [];
  const lastUsed = new Map();
  let fallbacks = 0;
  function generateDay(n) {
    const rng = mulberry32(hashStr("arcle-closest-" + dateForNumber(n)));
    const prompts = [];
    SLOTS.forEach((slot, s) => {
      const pool = byPop.filter(a => {
        const rk = RANK.get(a.id);
        return rk >= slot.ranks[0] && rk <= slot.ranks[1] && !prompts.some(p => p.mysteryId === a.id);
      });
      const fresh = pool.filter(a => !lastUsed.has(a.id) || n - lastUsed.get(a.id) >= NO_REPEAT_DAYS);
      let made = null;
      for (const a of shuffle(fresh, rng)) {
        const c = pickClues(a, slot, rng);
        if (c) { made = { mysteryId: a.id, ...c }; break; }
      }
      if (!made) {
        fallbacks++;
        for (const a of shuffle(pool, rng)) { const c = pickClues(a, slot, rng); if (c) { made = { mysteryId: a.id, ...c }; break; } }
      }
      prompts.push(made);
    });
    prompts.forEach(p => lastUsed.set(p.mysteryId, n));
    return prompts;
  }
  function getDay(dateStr) {
    const n = puzzleNumber(dateStr);
    if (n < 1) return null;
    while (dayCache.length < n) dayCache.push(generateDay(dayCache.length + 1));
    return { number: n, date: dateStr, prompts: dayCache[n - 1] };
  }
  const cluesForMode = (p, mode) => mode === "hard" ? p.clues.slice(0, -1) : p.clues;

  return { ANIME, BY_ID, RANK, TIERS, SLOTS, EPOCH, NO_REPEAT_DAYS, getDay, compare, tierFor, cluesForMode, fitting,
    puzzleNumber, dateForNumber, parseDate, fmtDate, get fallbacks() { return fallbacks; } };
}
if (typeof module !== "undefined") module.exports = createEngine;
