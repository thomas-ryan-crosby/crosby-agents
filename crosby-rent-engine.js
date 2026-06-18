// ── Crosby rent engine ───────────────────────────────────────────────────────
// The single, canonical rent computation shared by the dashboard rent roll
// (index.html), the Excel export, and the WhatsApp assistant
// (lib/assistant-tools.mjs). Pure and deterministic — no DOM, no I/O, no
// environment-specific APIs — so the same numbers come out everywhere.
//
// A lease's rent for a calendar month is computed in layers:
//     contractual rate  →  × holdover multiplier (if holding over)
//                       →  − abatement (free rent)
//     ( otherCharges are tracked separately — they are NOT base rent )
//
// Conventions (confirmed with the operator):
//  • Full-month billing, no proration — the commencement/termination/abatement
//    month is treated as a whole month.
//  • No rent before commencement; $0 after the committed term ends. An auto-renew
//    lease counts as committed forward only once its notice date has passed.
//  • monthlyRent is the rent in effect as of `asOf`. Escalations step at
//    escalationMonth/1 each year: applied forward, de-escalated for already
//    elapsed months this year, and never within the commencement year.
//  • escalationMonth is the lease's escalation-anniversary month (the Crosby
//    clause "the first month of the second calendar year of the lease term" =
//    one year past commencement).
//  • A rentSchedule lists explicit contractual rents per period; the latest
//    segment escalates from ITS OWN effective date (so a stated future step
//    isn't double-counted).
//  • Rent abatements (free rent) zero out (or % reduce) specific months.

export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Timezone-safe local parse of "YYYY-MM-DD" (avoids UTC rollback to the prior day).
function pd(s){ const p = String(s).split("-"); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
function num(v){ return Number(v) || 0; }

// Auto-renew lease is committed past its current term only once notice has passed.
export function continuesForward(lease, asOf){
  return lease.autoRenew === true && !!(lease.noticeDeadline && pd(lease.noticeDeadline) < asOf);
}

// Expired, still-active, non-auto-renew lease → holding over month-to-month.
export function isHoldover(lease, asOf){
  return !!(lease.terminates && pd(lease.terminates) < asOf
    && lease.autoRenew !== true && lease.status !== "vacating");
}

// Net percent abated (0–100) for the calendar month starting at `ms`.
export function abatementPct(lease, ms){
  const abs = lease.abatements;
  if(!abs || !abs.length) return 0;
  const mEnd = new Date(ms.getFullYear(), ms.getMonth() + 1, 0);
  for(const a of abs){ const f = pd(a.from), t = a.to ? pd(a.to) : f; if(f <= mEnd && t >= ms) return a.pct != null ? num(a.pct) : 100; }
  return 0;
}

// Contractual base rate for a month, before abatement/holdover/charges, with a
// short provenance tag. Returns { rate, source }.
export function contractualRate(lease, ms, asOf){
  if(lease.commenced && new Date(ms.getFullYear(), ms.getMonth() + 1, 0) < pd(lease.commenced))
    return { rate: 0, source: "before commencement" };

  const holding = isHoldover(lease, asOf);
  const term = holding ? null : (lease.terminates || null);
  if(term){ const td = pd(term); if(ms > td && !continuesForward(lease, asOf)) return { rate: 0, source: "after committed term" }; }

  // explicit rent schedule (segments are contractual; latest escalates from its effective date)
  if(lease.rentSchedule && lease.rentSchedule.length){
    let gov = null, cur = null;
    for(const seg of lease.rentSchedule){ const ef = pd(seg.effective);
      if(!cur || ef > pd(cur.effective)) cur = seg;
      if(ef <= ms && (!gov || ef > pd(gov.effective))) gov = seg; }
    if(gov){
      const gbase = num(gov.monthlyRent);
      const tag = gov.source || gov.note || "schedule";
      if(gov !== cur) return { rate: gbase, source: tag };
      if(lease.escalationPct && lease.escalationMonth){
        const ce = pd(cur.effective); let cc = 0;
        for(let yy = ce.getFullYear(); yy <= ms.getFullYear(); yy++){ const ee = new Date(yy, lease.escalationMonth - 1, 1); if(ee > ce && ee <= ms) cc++; }
        return { rate: gbase * Math.pow(1 + lease.escalationPct / 100, cc), source: (cur.source || "schedule") + (cc ? " +" + cc + "×" + lease.escalationPct + "%" : "") };
      }
      return { rate: gbase, source: tag };
    }
  }

  // escalation from the current rent, net-anchored at `asOf`
  if(lease.escalationPct && lease.escalationMonth){
    const cYear = lease.commenced ? parseInt(String(lease.commenced).slice(0, 4), 10) : -Infinity;
    let lo, hi, sign; if(ms >= asOf){ lo = asOf; hi = ms; sign = 1; } else { lo = ms; hi = asOf; sign = -1; }
    let c = 0; for(let y = lo.getFullYear(); y <= hi.getFullYear(); y++){ if(y <= cYear) continue; const ed = new Date(y, lease.escalationMonth - 1, 1); if(ed > lo && ed <= hi) c++; }
    const rate = num(lease.monthlyRent) * Math.pow(1 + lease.escalationPct / 100, sign * c);
    const source = c ? (sign > 0 ? "escalated +" + c + "×" + lease.escalationPct + "%" : "pre-escalation −" + c + "×" + lease.escalationPct + "%") : "current rent";
    return { rate, source };
  }

  return { rate: num(lease.monthlyRent), source: "flat rent" };
}

// Full breakdown for one lease-month. `month` is 0-based (0 = January).
export function rentForMonthDetailed(lease, year, month, asOf){
  asOf = asOf || new Date();
  const ms = new Date(year, month, 1);
  const cr = contractualRate(lease, ms, asOf);
  const out = { rent: cr.rate, contractual: cr.rate, abatedPct: 0, holdover: false,
    otherCharges: 0, gross: cr.rate, source: cr.source, note: null };
  if(cr.rate <= 0){ out.gross = 0; return out; }

  if(isHoldover(lease, asOf)){
    out.holdover = true;
    const mult = (lease.holdover && lease.holdover.multiplier != null) ? num(lease.holdover.multiplier) : 1;
    if(mult && mult !== 1){ out.rent *= mult; out.note = "holdover ×" + mult; }
    else out.note = "holdover";
  }
  const ab = abatementPct(lease, ms);
  if(ab){ out.abatedPct = ab; out.rent *= (1 - ab / 100); out.note = (out.note ? out.note + "; " : "") + (ab >= 100 ? "fully abated" : ab + "% abated"); }
  if(lease.otherCharges && lease.otherCharges.length){ out.otherCharges = lease.otherCharges.reduce((s, c) => s + num(c.monthlyAmount), 0); }
  out.gross = out.rent + out.otherCharges;
  return out;
}

// Net base rent for one lease-month (after abatement/holdover; excludes other charges).
export function rentForMonth(lease, year, month, asOf){
  return rentForMonthDetailed(lease, year, month, asOf).rent;
}

// Base rent for a full calendar year.
export function annualRent(lease, year, asOf){
  let s = 0; for(let m = 0; m < 12; m++) s += rentForMonth(lease, year, m, asOf); return s;
}

// Net effective rent over a window (defaults to the lease's committed term:
// commenced → terminates). Averages base rent net of abatements, and (if a TI
// allowance is recorded) amortizes it across the window. Pass an explicit
// {fromYear, fromMonth, toYear, toMonth} to scope it to a renewal term.
export function netEffectiveRent(lease, asOf, win){
  asOf = asOf || new Date();
  const start = win ? new Date(win.fromYear, win.fromMonth, 1) : (lease.commenced ? pd(lease.commenced) : null);
  const end = win ? new Date(win.toYear, win.toMonth, 1) : (lease.terminates ? pd(lease.terminates) : null);
  if(!start || !end || end < start) return null;
  let total = 0, months = 0, y = start.getFullYear(), m = start.getMonth();
  while(new Date(y, m, 1) <= end && months < 600){
    total += rentForMonth(lease, y, m, asOf); months++;
    if(++m > 11){ m = 0; y++; }
  }
  const ti = (lease.concessions && lease.concessions.tiAllowance) ? num(lease.concessions.tiAllowance) : 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { months, totalRent: r2(total), avgMonthly: months ? r2(total / months) : 0,
    tiAllowance: ti, netAvgMonthly: months ? r2((total - ti) / months) : 0 };
}
