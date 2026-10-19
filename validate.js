const RAW = require("./data.js");
const E = require("./engine.js")(RAW);
const days = +(process.argv[2] || 30);
const problems = [];
const seen = new Map();
const tierCount = { bullseye: 0, close: 0, warm: 0, cold: 0 };
const start = 1;
for (let n = start; n < start + days; n++) {
  const date = E.dateForNumber(n);
  const d = E.getDay(date);
  const line = [];
  d.prompts.forEach((p, s) => {
    if (!p) { problems.push(`${date} P${s + 1}: no prompt could be made`); return; }
    const slot = E.SLOTS[s];
    const a = E.BY_ID.get(p.mysteryId);
    const rk = E.RANK.get(a.id);
    const fitE = E.fitting(E.cluesForMode(p, "easy"));
    const fitH = E.fitting(E.cluesForMode(p, "hard"));
    if (!fitE.some(x => x.id === a.id) || !fitH.some(x => x.id === a.id)) problems.push(`${date} P${s + 1}: mystery does not fit its own clues`);
    if (fitE.length < slot.fit[0] || fitE.length > slot.fit[1]) problems.push(`${date} P${s + 1}: ${fitE.length} fits, outside ${slot.fit}`);
    if (fitH.length <= fitE.length) problems.push(`${date} P${s + 1}: Hard clues are not wider than Easy`);
    if (rk < slot.ranks[0] || rk > slot.ranks[1]) problems.push(`${date} P${s + 1}: rank ${rk} outside slot band`);
    if (seen.has(a.id) && n - seen.get(a.id) < E.NO_REPEAT_DAYS) problems.push(`${date} P${s + 1}: ${a.english} repeats from day ${seen.get(a.id)}`);
    seen.set(a.id, n);
    if (new Set(d.prompts.map(x => x.mysteryId)).size !== 5) problems.push(`${date}: same mystery twice in one day`);
    // Score of the best wrong answer that fits the Easy clues (what a good player gets without the exact hit).
    const others = fitE.filter(x => x.id !== a.id).map(x => E.compare(x, a).score);
    if (others.length) tierCount[E.tierFor(Math.max(...others))]++;
    line.push(`[${fitE.length}/${fitH.length}] ${p.clues.map(c => c.chip).join(" · ")} => ${a.english} (#${rk})`);
  });
  if (days <= 31) console.log(`#${n} ${date}\n   ` + line.join("\n   "));
}
console.log(`Best near-miss tier spread: ${JSON.stringify(tierCount)}`);
console.log(`Fallbacks used: ${E.fallbacks}`);
console.log(problems.length ? "PROBLEMS:\n" + problems.slice(0, 30).join("\n") + (problems.length > 30 ? `\n...and ${problems.length - 30} more` : "") : `All ${days} days pass every rule.`);
process.exit(problems.length ? 1 : 0);
