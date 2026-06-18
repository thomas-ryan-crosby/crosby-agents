// Test plan for the canonical rent engine (crosby-rent-engine.js).
//   node scripts/test-rent-engine.mjs
//
//  A) Regression equivalence — every Sanctuary lease × 6 years must match the
//     pre-refactor baseline captured in scripts/_rent_baseline.json.
//  B) Golden cases — pin the exact hand-verified figures we confirmed with the
//     operator (Acorn, Brandner, M Squared, Gary Thomas, Hartford, 4 Your Eyes,
//     Pazos, Baker Donelson).
//  C) Feature unit tests — exercise each engine capability on synthetic leases
//     (commencement, term cutoff, escalation fwd/back, commencement-year guard,
//     rentSchedule, abatements full/partial, holdover + premium, other charges,
//     net effective rent).
import { readFileSync } from "node:fs";
import { rentForMonth, rentForMonthDetailed, annualRent, netEffectiveRent, MONTHS } from "../crosby-rent-engine.js";

const ASOF = new Date("2026-06-17T12:00:00");
const r2 = (n) => Math.round(n * 100) / 100;
let pass = 0, fail = 0; const fails = [];
function ok(name, got, want, eps = 0.005) {
  const good = Math.abs(r2(got) - r2(want)) <= eps;
  if (good) pass++; else { fail++; fails.push(`${name}: got ${r2(got)} want ${r2(want)}`); }
}
function okEq(name, got, want) { if (got === want) pass++; else { fail++; fails.push(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } }

const leases = JSON.parse(readFileSync(new URL("../data/leases.json", import.meta.url)));
const byId = new Map(leases.map((l) => [l.id, l]));

// ── A) Regression equivalence vs baseline ────────────────────────────────────
// The baseline captures the pre-engine behavior. INTENDED_DIFFS are the few
// cells the engine deliberately changes (and the correct new value):
//  - lease-bldg1-suite307-detox 2028-Aug: this lease uniquely terminates on the
//    1st of a month (2028-08-01); the old code parsed terminates as UTC (rolling
//    back to Jul 31 in US time) and dropped August. The engine parses locally and
//    bills the terminate month, consistent with how it bills the commencement
//    month — so August 2028 is correctly billed at $615.95.
const INTENDED_DIFFS = { "lease-bldg1-suite307-detox|2028|Aug": 615.95 };
const baseline = JSON.parse(readFileSync(new URL("./rent-engine-baseline.json", import.meta.url)));
let cmp = 0, intended = 0;
for (const id of Object.keys(baseline)) {
  const lease = byId.get(id); if (!lease) { fail++; fails.push(`baseline lease missing: ${id}`); continue; }
  for (const y of Object.keys(baseline[id].years)) {
    const sched = baseline[id].years[y]; if (!sched || typeof sched !== "object") continue;
    for (let m = 0; m < 12; m++) { const want = sched[MONTHS[m]]; if (want == null) continue;
      const key = `${id}|${y}|${MONTHS[m]}`;
      if (key in INTENDED_DIFFS) { ok(`intended ${baseline[id].tenant} ${y}-${MONTHS[m]}`, rentForMonth(lease, +y, m, ASOF), INTENDED_DIFFS[key]); intended++; continue; }
      ok(`equiv ${baseline[id].tenant} ${y}-${MONTHS[m]}`, rentForMonth(lease, +y, m, ASOF), want); cmp++; }
  }
}
console.log(`A) regression equivalence: ${cmp} lease-months matched baseline, ${intended} intended difference(s) verified`);

// ── B) Golden cases ──────────────────────────────────────────────────────────
const acorn = byId.get("lease-bldg1-suite301b-acorn"), brand = byId.get("lease-bldg1-suite303b-brandner");
const MS = byId.get("lease-bldg1-suite300-msquared");
const gary = byId.get("lease-bldg2-suite304-thomas"), hart = byId.get("lease-bldg2-suite301-hartford");
const fye = byId.get("lease-bldg2-suite303-4-your-eyes"), pazos = byId.get("lease-bldg2-suite202-pazos");
const baker = byId.get("lease-bldg3-suite201-baker-donelson");

ok("golden Acorn 2026 Jan", rentForMonth(acorn, 2026, 0, ASOF), 424.36);
ok("golden Acorn 2026 Mar", rentForMonth(acorn, 2026, 2, ASOF), 437.09);
ok("golden Brandner 2026 Jan", rentForMonth(brand, 2026, 0, ASOF), 862);
ok("golden Brandner 2026 Apr", rentForMonth(brand, 2026, 3, ASOF), 431);
ok("golden Brandner 2026 Nov", rentForMonth(brand, 2026, 10, ASOF), 443.93);
ok("golden M Squared 2026 Jan", rentForMonth(MS, 2026, 0, ASOF), 0);
ok("golden M Squared 2026 Mar", rentForMonth(MS, 2026, 2, ASOF), 2250);
ok("golden M Squared 2027 Apr", rentForMonth(MS, 2027, 3, ASOF), 2317.5);
ok("golden Gary 2026 Jul", rentForMonth(gary, 2026, 6, ASOF), 1948.86);
ok("golden Gary 2026 Aug", rentForMonth(gary, 2026, 7, ASOF), 2007.32);
ok("golden Gary 2027 Aug (past term)", rentForMonth(gary, 2027, 7, ASOF), 0);
ok("golden Hartford 2026 Oct", rentForMonth(hart, 2026, 9, ASOF), 4213.62);
ok("golden Hartford 2027 Oct", rentForMonth(hart, 2027, 9, ASOF), 4318.12);
ok("golden Hartford 2028 Oct", rentForMonth(hart, 2028, 9, ASOF), 4423.87);
ok("golden Hartford 2029 Oct (past term)", rentForMonth(hart, 2029, 9, ASOF), 0);
ok("golden 4YE 2026 Mar", rentForMonth(fye, 2026, 2, ASOF), 3616.46);
ok("golden 4YE 2026 Apr", rentForMonth(fye, 2026, 3, ASOF), 4304.39);
ok("golden Pazos 2026 May", rentForMonth(pazos, 2026, 4, ASOF), 950.07);
ok("golden Pazos 2026 Jun", rentForMonth(pazos, 2026, 5, ASOF), 978.57);
ok("golden Baker 2026 Feb", rentForMonth(baker, 2026, 1, ASOF), 13282.50);
ok("golden Baker 2026 Mar (abated)", rentForMonth(baker, 2026, 2, ASOF), 0);
ok("golden Baker 2026 Apr", rentForMonth(baker, 2026, 3, ASOF), 13680.98);
ok("golden Baker 2027 Mar (abated)", rentForMonth(baker, 2027, 2, ASOF), 0);
ok("golden Baker 2028 Mar (not abated)", rentForMonth(baker, 2028, 2, ASOF), 14514.15);

// ── C) Feature unit tests (synthetic leases) ─────────────────────────────────
// pre-commencement & flat
const c1 = { monthlyRent: 1000, commenced: "2026-06-01", terminates: null };
ok("unit pre-commencement May", rentForMonth(c1, 2026, 4, ASOF), 0);
ok("unit commencement month full", rentForMonth(c1, 2026, 5, ASOF), 1000);
ok("unit flat future", rentForMonth(c1, 2027, 0, ASOF), 1000);
// term cutoff
const c2 = { monthlyRent: 500, commenced: "2020-01-01", terminates: "2026-12-31", autoRenew: false };
ok("unit in-term Dec 2026", rentForMonth(c2, 2026, 11, ASOF), 500);
ok("unit post-term Jan 2027", rentForMonth(c2, 2027, 0, ASOF), 0);
// escalation fwd + de-escalation + commencement-year guard
const c3 = { monthlyRent: 103, commenced: "2020-03-01", terminates: "2030-03-31", escalationPct: 3, escalationMonth: 3, autoRenew: false };
ok("unit de-escalate Jan 2026", rentForMonth(c3, 2026, 0, ASOF), 100);          // 103/1.03
ok("unit escalate Mar 2026", rentForMonth(c3, 2026, 2, ASOF), 103);
ok("unit escalate Mar 2027", rentForMonth(c3, 2027, 2, ASOF), 106.09);
const c3b = { monthlyRent: 200, commenced: "2026-02-01", terminates: "2030-01-31", escalationPct: 3, escalationMonth: 2, autoRenew: false };
ok("unit no escalation in commencement year (Feb 2026)", rentForMonth(c3b, 2026, 1, ASOF), 200);
ok("unit first escalation next year (Feb 2027)", rentForMonth(c3b, 2027, 1, ASOF), 206);
// rentSchedule: prior flat + latest escalates from effective date
const c4 = { monthlyRent: 300, commenced: "2024-01-01", terminates: "2030-01-31", escalationPct: 3, escalationMonth: 1,
  rentSchedule: [ { effective: "2024-01-01", monthlyRent: 280 }, { effective: "2026-01-01", monthlyRent: 300 } ] };
ok("unit schedule prior segment flat (2025)", rentForMonth(c4, 2025, 5, ASOF), 280);
ok("unit schedule latest flat in its year (Dec 2026)", rentForMonth(c4, 2026, 11, ASOF), 300);
ok("unit schedule latest escalates next anniv (Jan 2027)", rentForMonth(c4, 2027, 0, ASOF), 309);
// abatements full + partial
const c5 = { monthlyRent: 1000, commenced: "2025-01-01", terminates: "2030-01-31",
  abatements: [ { from: "2026-03-01", to: "2026-03-31", pct: 100 }, { from: "2026-04-01", to: "2026-04-30", pct: 50 } ] };
ok("unit abatement full Mar", rentForMonth(c5, 2026, 2, ASOF), 0);
ok("unit abatement 50% Apr", rentForMonth(c5, 2026, 3, ASOF), 500);
ok("unit no abatement May", rentForMonth(c5, 2026, 4, ASOF), 1000);
// holdover (expired, active, non-auto-renew) — continues; + premium multiplier
const c6 = { monthlyRent: 700, commenced: "2018-01-01", terminates: "2025-12-31", autoRenew: false, status: "active" };
ok("unit holdover continues at rate", rentForMonth(c6, 2026, 5, ASOF), 700);
const d6 = rentForMonthDetailed(c6, 2026, 5, ASOF); okEq("unit holdover flagged", d6.holdover, true);
const c6b = { ...c6, holdover: { multiplier: 1.5 } };
ok("unit holdover premium 1.5x", rentForMonth(c6b, 2026, 5, ASOF), 1050);
// other charges (separate from base rent)
const c7 = { monthlyRent: 1000, commenced: "2025-01-01", terminates: "2030-01-31", otherCharges: [ { label: "parking", monthlyAmount: 150 } ] };
const d7 = rentForMonthDetailed(c7, 2026, 5, ASOF);
ok("unit base rent excludes charges", d7.rent, 1000);
ok("unit gross includes charges", d7.gross, 1150);
ok("unit otherCharges total", d7.otherCharges, 150);
// net effective rent over a window with an abated month + TI
const c8 = { monthlyRent: 1000, commenced: "2026-01-01", terminates: "2026-12-31",
  abatements: [ { from: "2026-01-01", to: "2026-01-31", pct: 100 } ], concessions: { tiAllowance: 1200 } };
const ne = netEffectiveRent(c8, ASOF, { fromYear: 2026, fromMonth: 0, toYear: 2026, toMonth: 11 });
okEq("unit netEffective months", ne.months, 12);
ok("unit netEffective total (11×1000)", ne.totalRent, 11000);
ok("unit netEffective avg", ne.avgMonthly, 916.67);
ok("unit netEffective net of TI", ne.netAvgMonthly, 816.67);   // (11000-1200)/12

// ── report ───────────────────────────────────────────────────────────────────
console.log(`B+C) golden + unit assertions run`);
console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
if (fail) { console.log("\nFAILURES:"); fails.slice(0, 40).forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
console.log("✓ all green");
