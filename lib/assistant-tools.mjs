// Deterministic lookup/compute functions for the property assistant. The model
// calls these (via tool/function calling) instead of doing math in its head, so
// figures are always exact and come straight from the data + the dashboard's
// own viewmodel. Each function returns a plain object that is JSON-stringified
// back to the model, which then phrases the answer.
import { loadEntities } from "./portfolio.mjs";
import { deriveViewModel } from "../crosby-viewmodel.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// crude but effective fuzzy score between a query and a name
function fuzzy(query, name) {
  const q = norm(query), n = norm(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.includes(q) || q.includes(n)) return 50;
  const qt = q.split(" ").filter((w) => w.length >= 3);
  const nt = n.split(" ");
  let hits = 0;
  for (const w of qt) if (nt.includes(w) || n.includes(w)) hits++;
  return hits * 10;
}

export async function buildContext() {
  const E = await loadEntities();
  const vm = deriveViewModel(E);
  return {
    E, vm,
    unitById: new Map((E.units || []).map((u) => [u.id, u])),
    tenantById: new Map((E.tenants || []).map((t) => [t.id, t])),
    bldgById: new Map((E.buildings || []).map((b) => [b.id, b])),
    propById: new Map((E.properties || []).map((p) => [p.id, p])),
    today: new Date(),
  };
}

function leaseView(l, ctx) {
  const u = ctx.unitById.get(l.unitId) || {}, t = ctx.tenantById.get(l.tenantId) || {},
        b = ctx.bldgById.get(u.buildingId) || {}, p = ctx.propById.get(l.propertyId) || {};
  return {
    tenant: t.name || u.identifier || "?", property: p.name || l.propertyId,
    building: b.name || null, suite: u.identifier || null, sf: u.sf || 0,
    monthlyRent: round2(l.monthlyRent), commenced: l.commenced || null, terminates: l.terminates || null,
    escalation: l.escalationPct != null ? (l.escalationPct + "%" + (l.escalationMonth ? " each " + MONTHS[l.escalationMonth - 1] : "")) : null,
    renewal: l.autoRenew === true ? "auto-renew" : (l.autoRenew === false ? "fixed-term" : "unknown"),
    noticeDeadline: l.noticeDeadline || null, status: l.status || "active",
  };
}
const propMatch = (q, ctx) => { let best = 0, p = null; for (const x of ctx.E.properties || []) { const s = fuzzy(q, x.name); if (s > best) { best = s; p = x; } } return best > 0 ? p : null; };
// Building identifier comparison — strips the word "building/bldg/#" so only the
// distinguishing part (e.g. the number) is compared. Avoids "Building" matching every building.
const bnum = (s) => norm(s).replace(/\b(building|bldg|suite|ste)\b/g, "").replace(/[#]/g, "").replace(/\s+/g, " ").trim();
const buildingMatches = (q, name) => { const a = bnum(q), b = bnum(name); return a !== "" && (a === b || b === a); };
const daysBetween = (iso, today) => { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : Math.round((d - today) / 86400000); };

// ── tools ────────────────────────────────────────────────────────────────────
export function find_tenant(args, ctx) {
  const name = args.name || "";
  const scored = (ctx.E.leases || [])
    .map((l) => ({ score: fuzzy(name, (ctx.tenantById.get(l.tenantId) || {}).name || ""), l }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  if (!scored.length) return { matches: [], note: `No tenant found matching "${name}".` };
  return { matches: scored.slice(0, 3).map((x) => leaseView(x.l, ctx)) };
}

export function get_lease_documents(args, ctx) {
  const name = args.tenant || "";
  const wantAll = !!(args.all === true || args.all === "true" || args.allDocuments === true);
  const matched = (ctx.E.leaseDocs || [])
    .map((d) => ({ score: fuzzy(name, d.tenant || ""), d }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12).map((x) => x.d);
  if (!matched.length) return { documents: [], note: `No lease documents on file matching "${name}".` };
  const shape = (d) => ({
    tenant: d.tenant, docType: d.docType, building: d.building || null, suite: d.suite || null,
    dated: d.date || (d.meta && d.meta.dated) || null, title: (d.meta && d.meta.title) || null,
    pdf: d.url || null, html: d.htmlUrl || null,
  });
  if (wantAll) {
    return { documents: matched.map(shape), count: matched.length,
      note: "Share the html link when available, otherwise the pdf link." };
  }
  // Default: return ONLY the current (most-recently-dated) document. Amendments
  // supersede the original, so the latest date is the operative one. This keeps
  // the WhatsApp reply short — listing every amendment blows past the message
  // length limit. The user can ask for "all" to get the full set.
  const ts = (d) => { const t = Date.parse(d.date || (d.meta && d.meta.dated) || ""); return isNaN(t) ? -Infinity : t; };
  const current = matched.slice().sort((a, b) => ts(b) - ts(a))[0];
  const others = matched.length - 1;
  return {
    document: shape(current),
    otherDocumentsAvailable: others,
    note: others > 0
      ? `Returning ONLY the current (most recent) document. ${others} earlier document(s)/amendment(s) are also on file — if the user asks for all of them, call get_lease_documents again with all=true. Share the html link when available, otherwise the pdf link. Send exactly one link.`
      : "Share the html link when available, otherwise the pdf link. Send exactly one link.",
  };
}

export function building_or_property_rent(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.status !== "owner-occupant");
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  if (args.building) {
    leases = leases.filter((l) => { const b = ctx.bldgById.get((ctx.unitById.get(l.unitId) || {}).buildingId) || {}; return buildingMatches(args.building, b.name || ""); });
  }
  if (!leases.length) return { note: `No leases found for property="${args.property || "all"}" building="${args.building || "all"}".` };
  const monthly = leases.reduce((s, l) => s + Number(l.monthlyRent), 0);
  const vacating = leases.filter((l) => l.status === "vacating").map((l) => { const v = leaseView(l, ctx); return { tenant: v.tenant, suite: v.suite, monthlyRent: v.monthlyRent, vacateDate: l.vacateDate || l.terminates }; });
  const out = {
    property: prop ? prop.name : "(all properties)", building: args.building || null,
    tenantCount: leases.length, monthlyRent: round2(monthly), annualRent: round2(monthly * 12),
    note: "annualRent = current monthly rent x 12; it does not adjust for scheduled escalations or mid-year move-outs. If tenants are vacating, the realized annual will be lower.",
    vacatingSoon: vacating,
  };
  // Include the per-tenant breakdown only when scoped to a building (keeps results small).
  if (args.building) out.tenants = leases.map((l) => { const v = leaseView(l, ctx); return { tenant: v.tenant, suite: v.suite, monthlyRent: v.monthlyRent, status: v.status }; });
  return out;
}

export function portfolio_totals(_args, ctx) {
  const byProp = {};
  for (const l of ctx.E.leases || []) { if (Number(l.monthlyRent) > 0 && l.status !== "owner-occupant") byProp[l.propertyId] = (byProp[l.propertyId] || 0) + Number(l.monthlyRent); }
  const props = (ctx.E.properties || []).map((p) => ({ property: p.name, type: p.type || null, monthlyRent: round2(byProp[p.id] || 0), annualRent: round2((byProp[p.id] || 0) * 12) }))
    .sort((a, b) => b.monthlyRent - a.monthlyRent);
  const totalMonthly = props.reduce((s, p) => s + p.monthlyRent, 0);
  // highest-grossing commercial building (Sanctuary etc.)
  const byBldg = {};
  for (const l of ctx.E.leases || []) {
    if (!(Number(l.monthlyRent) > 0)) continue;
    const u = ctx.unitById.get(l.unitId) || {}, b = ctx.bldgById.get(u.buildingId) || {}, p = ctx.propById.get(l.propertyId) || {};
    if (!b.name) continue;
    const key = (p.name || "") + " · " + b.name;
    byBldg[key] = (byBldg[key] || 0) + Number(l.monthlyRent);
  }
  const buildings = Object.entries(byBldg).map(([k, v]) => ({ building: k, monthlyRent: round2(v) })).sort((a, b) => b.monthlyRent - a.monthlyRent);
  return {
    byProperty: props, portfolioMonthlyRent: round2(totalMonthly), portfolioAnnualRent: round2(totalMonthly * 12),
    highestGrossingProperty: props[0] || null,
    highestGrossingBuilding: buildings[0] || null,
    note: "Rent is current monthly base rent; annual = x 12. Highest-grossing property includes apartment complexes (which gross far more than individual office buildings).",
  };
}

export function property_summary(args, ctx) {
  const p = propMatch(args.property || "", ctx);
  if (!p) return { note: `No property found matching "${args.property}".` };
  const vp = (ctx.vm.PROPERTIES || []).find((x) => x.slug === p.id) || {};
  const leases = (ctx.E.leases || []).filter((l) => l.propertyId === p.id && Number(l.monthlyRent) > 0);
  const units = (ctx.E.units || []).filter((u) => u.propertyId === p.id);
  const monthly = leases.reduce((s, l) => s + Number(l.monthlyRent), 0);
  const out = { property: p.name, type: p.type || null, monthlyRent: round2(monthly), annualRent: round2(monthly * 12) };
  if (vp.totalSF != null) { out.totalSF = vp.totalSF; out.occupiedSF = vp.occupiedSF || 0; out.vacantSF = vp.vacantSF || 0; out.occupancyPct = vp.totalSF ? round2(100 * (vp.occupiedSF || 0) / vp.totalSF) : null; }
  else { out.units = units.length; out.leasedUnits = leases.length; out.occupancyPct = units.length ? round2(100 * leases.length / units.length) : null; }
  return out;
}

export function expiring_leases(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  const through = args.throughDate ? new Date(args.throughDate) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.status !== "owner-occupant" && (l.terminates || l.status === "vacating"));
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  const rows = leases.map((l) => {
    const v = leaseView(l, ctx);
    const d = l.vacateDate || l.terminates;
    return { tenant: v.tenant, property: v.property, building: v.building, suite: v.suite, date: d,
      daysAway: daysBetween(d, ctx.today), vacating: l.status === "vacating", renewal: v.renewal };
  }).filter((r) => r.date && (!through || new Date(r.date) <= through))
    // drop already-past auto-renew end dates (they renewed; not actually expiring)
    .filter((r) => !(r.renewal === "auto-renew" && r.daysAway != null && r.daysAway < 0 && !r.vacating))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { count: rows.length, leases: rows,
    note: "Sorted soonest-first. 'vacating' tenants have given notice and need re-leasing. 'auto-renew' leases roll over automatically unless the tenant gives notice; 'fixed-term' leases truly end." };
}

export function vacancies(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let units = (ctx.E.units || []).filter((u) => u.status === "vacant");
  if (prop) units = units.filter((u) => u.propertyId === prop.id);
  return { count: units.length, units: units.map((u) => { const b = ctx.bldgById.get(u.buildingId) || {}, p = ctx.propById.get(u.propertyId) || {}; return { property: p.name, building: b.name || null, suite: u.identifier || null, sf: u.sf || 0 }; }) };
}

export function insurance_status(args, ctx) {
  let cois = ctx.E.cois || [];
  if (args.tenant) cois = cois.filter((c) => fuzzy(args.tenant, c.tenant || "") > 0);
  if (args.property) { const p = propMatch(args.property, ctx); if (p) cois = cois.filter((c) => c.propertyId === p.id); }
  // latest COI per tenant
  const byTenant = {};
  for (const c of cois) { const k = c.tenant; if (!byTenant[k] || String(c.date || "") > String(byTenant[k].date || "")) byTenant[k] = c; }
  const rows = Object.values(byTenant).map((c) => {
    const exp = c.expiration || (c.coverages && c.coverages[0] && c.coverages[0].expiration) || null;
    const days = daysBetween(exp, ctx.today);
    const status = days == null ? "unknown" : days < 0 ? "EXPIRED" : days <= 60 ? "expiring soon" : "current";
    return { tenant: c.tenant, building: c.building || null, suite: c.suite || null, carrier: (c.meta && c.meta.carrier) || c.producer || null, expiration: exp, status };
  }).sort((a, b) => String(a.expiration || "").localeCompare(String(b.expiration || "")));
  return { count: rows.length, certificates: rows, note: args.tenant || args.property ? undefined : "All certificates of insurance on file." };
}

// Projected base rent for one lease in a given month — matches the dashboard
// rent roll: $0 before the lease commences or after its committed term ends
// (auto-renew leases continue only once their notice date has passed), and the
// current rent stepped up by each escalation since today.
function monthRentFor(l, Y, m, today) {
  const ms = new Date(Y, m, 1);
  if (l.commenced && new Date(Y, m + 1, 0) < new Date(l.commenced)) return 0;
  const noticePassed = !!(l.noticeDeadline && new Date(l.noticeDeadline) < today);
  const continuesForward = l.autoRenew === true && noticePassed;
  if (l.terminates) { const td = new Date(l.terminates); if (ms > td && !continuesForward) return 0; }
  const rent = Number(l.monthlyRent) || 0;
  if (l.escalationPct && l.escalationMonth) {
    let c = 0; for (let y = today.getFullYear(); y <= Y; y++) { const ed = new Date(y, l.escalationMonth - 1, 1); if (ed > today && ed <= ms) c++; }
    return rent * Math.pow(1 + l.escalationPct / 100, c);
  }
  return rent;
}

export function monthly_rent_roll(args, ctx) {
  const year = parseInt(args.year, 10) || ctx.today.getFullYear();
  if (args.tenant) {
    const scored = (ctx.E.leases || []).map((l) => ({ s: fuzzy(args.tenant, (ctx.tenantById.get(l.tenantId) || {}).name || ""), l })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) return { note: `No tenant found matching "${args.tenant}".` };
    const l = scored[0].l, v = leaseView(l, ctx), schedule = {}; let annual = 0;
    for (let m = 0; m < 12; m++) { const r = round2(monthRentFor(l, year, m, ctx.today)); schedule[MONTHS[m]] = r; annual += r; }
    return { tenant: v.tenant, property: v.property, building: v.building, suite: v.suite, year, schedule, annualTotal: round2(annual),
      note: "Monthly base rent; $0 in months before the lease commences or after its committed term ends; escalations applied in the escalation month." };
  }
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.status !== "owner-occupant");
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  if (args.building) leases = leases.filter((l) => buildingMatches(args.building, (ctx.bldgById.get((ctx.unitById.get(l.unitId) || {}).buildingId) || {}).name || ""));
  if (!leases.length) return { note: `No leases found for property="${args.property || "all"}" building="${args.building || ""}".` };
  const monthlyTotals = {}; let annual = 0;
  for (let m = 0; m < 12; m++) { let t = 0; for (const l of leases) t += monthRentFor(l, year, m, ctx.today); monthlyTotals[MONTHS[m]] = round2(t); annual += t; }
  return { scope: (prop ? prop.name : "all properties") + (args.building ? " / " + args.building : ""), year, tenantCount: leases.length, monthlyTotals, annualTotal: round2(annual),
    note: "Monthly base-rent totals across the matched leases for the year." };
}

// ── section B helpers ────────────────────────────────────────────────────────
const yearsBetween = (iso, today) => { const d = daysBetween(iso, today); return d == null ? null : Math.round((d / 365) * 10) / 10; };
const committedForward = (l, today) => l.autoRenew === true && !!(l.noticeDeadline && new Date(l.noticeDeadline) < today);
function leaseForTenant(name, ctx) {
  const s = (ctx.E.leases || []).map((l) => ({ s: fuzzy(name, (ctx.tenantById.get(l.tenantId) || {}).name || ""), l })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return s.length ? s[0].l : null;
}
// Recommended next step for a lease — mirrors the dashboard "Lease Action" logic.
function computeLeaseAction(lease, vacant, today) {
  if (vacant) return { label: "Begin Marketing", tone: "urgent" };
  if (!lease) return { label: "—", tone: "neutral" };
  if (lease.status === "owner-occupant") return { label: "Owner-Occupied", tone: "neutral" };
  if (lease.status === "vacating") return { label: "Begin Marketing", tone: "urgent" };
  if (lease.status === "mtm") return { label: "Formalize Lease", tone: "attention" };
  const expDays = daysBetween(lease.terminates, today);
  if (expDays == null) return { label: "Confirm Lease Terms", tone: "attention" };
  const ndDays = daysBetween(lease.noticeDeadline, today);
  if (lease.autoRenew === true) {
    if (ndDays == null) return expDays <= 150 ? { label: "Confirm Renewal", tone: "attention" } : { label: "Cash Checks", tone: "steady" };
    if (ndDays < 0) return { label: "Cash Checks", tone: "steady" };
    if (ndDays <= 60) return { label: "Renewal Decision Due", tone: "urgent" };
    if (ndDays <= 150) return { label: "Renewal Decision", tone: "attention" };
    return { label: "Cash Checks", tone: "steady" };
  }
  if (lease.autoRenew === false) {
    if (expDays < 0) return { label: "Expired — Re-market", tone: "urgent" };
    if (expDays <= 90) return { label: "Renew or Re-market", tone: "urgent" };
    if (expDays <= 180) return { label: "Negotiate Renewal", tone: "attention" };
    return { label: "Cash Checks", tone: "steady" };
  }
  if (expDays < 0) return { label: "Expired — Verify", tone: "urgent" };
  if (expDays <= 90) return { label: "Expiring — Verify Terms", tone: "urgent" };
  if (expDays <= 180) return { label: "Verify & Plan Renewal", tone: "attention" };
  return { label: "Verify Renewal Terms", tone: "attention" };
}

// ── section B tools ──────────────────────────────────────────────────────────
export function next_rent_increase(args, ctx) {
  const l = leaseForTenant(args.tenant || "", ctx);
  if (!l) return { note: `No tenant found matching "${args.tenant}".` };
  const v = leaseView(l, ctx);
  if (!l.escalationPct || !l.escalationMonth) return { tenant: v.tenant, suite: v.suite, currentRent: v.monthlyRent, note: "No scheduled escalation on file for this lease." };
  const t = ctx.today; let d = new Date(t.getFullYear(), l.escalationMonth - 1, 1); if (d <= t) d = new Date(t.getFullYear() + 1, l.escalationMonth - 1, 1);
  const newRent = round2(v.monthlyRent * (1 + l.escalationPct / 100));
  return { tenant: v.tenant, suite: v.suite, currentRent: v.monthlyRent, escalationPct: l.escalationPct, nextIncreaseDate: d.toISOString().slice(0, 10), newMonthlyRent: newRent, increaseAmount: round2(newRent - v.monthlyRent) };
}

export function lease_action(args, ctx) {
  const l = leaseForTenant(args.tenant || "", ctx);
  if (!l) return { note: `No tenant found matching "${args.tenant}".` };
  const v = leaseView(l, ctx), a = computeLeaseAction(l, false, ctx.today);
  return { tenant: v.tenant, suite: v.suite, action: a.label, urgency: a.tone, terminates: l.terminates || null, noticeDeadline: l.noticeDeadline || null, renewal: v.renewal, status: v.status };
}

export function notice_deadlines(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  const within = args.withinDays ? parseInt(args.withinDays, 10) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.noticeDeadline);
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  const rows = leases.map((l) => { const v = leaseView(l, ctx); return { tenant: v.tenant, property: v.property, building: v.building, suite: v.suite, noticeDeadline: l.noticeDeadline, daysAway: daysBetween(l.noticeDeadline, ctx.today), terminates: l.terminates || null }; })
    .filter((r) => r.daysAway != null && r.daysAway >= 0 && (within == null || r.daysAway <= within))
    .sort((a, b) => a.daysAway - b.daysAway);
  return { count: rows.length, deadlines: rows, note: "Renewal/termination notice deadlines, soonest first." };
}

export function building_directory(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.status !== "owner-occupant");
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  if (args.building) leases = leases.filter((l) => buildingMatches(args.building, (ctx.bldgById.get((ctx.unitById.get(l.unitId) || {}).buildingId) || {}).name || ""));
  if (!leases.length) return { note: `No tenants found for property="${args.property || "all"}" building="${args.building || ""}".` };
  leases.sort((a, b) => String((ctx.unitById.get(a.unitId) || {}).identifier).localeCompare(String((ctx.unitById.get(b.unitId) || {}).identifier), undefined, { numeric: true }));
  const tenants = leases.map((l) => { const v = leaseView(l, ctx); return { tenant: v.tenant, suite: v.suite, sf: v.sf, monthlyRent: v.monthlyRent, status: v.status }; });
  return { scope: (prop ? prop.name : "all") + (args.building ? " / " + args.building : ""), count: tenants.length, totalSF: tenants.reduce((s, t) => s + t.sf, 0), totalMonthlyRent: round2(tenants.reduce((s, t) => s + t.monthlyRent, 0)), tenants };
}

export function space_search(args, ctx) {
  const min = args.minSF ? Number(args.minSF) : 0, max = args.maxSF ? Number(args.maxSF) : Infinity;
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let units = (ctx.E.units || []).filter((u) => u.status === "vacant" && (Number(u.sf) || 0) >= min && (Number(u.sf) || 0) <= max);
  if (prop) units = units.filter((u) => u.propertyId === prop.id);
  units.sort((a, b) => (a.sf || 0) - (b.sf || 0));
  return { count: units.length, criteria: { minSF: min || null, maxSF: isFinite(max) ? max : null, property: prop ? prop.name : null }, units: units.map((u) => { const b = ctx.bldgById.get(u.buildingId) || {}, p = ctx.propById.get(u.propertyId) || {}; return { property: p.name, building: b.name || null, suite: u.identifier || null, sf: u.sf || 0 }; }) };
}

export function rent_per_sf(args, ctx) {
  if (args.tenant) { const l = leaseForTenant(args.tenant, ctx); if (!l) return { note: `No tenant found matching "${args.tenant}".` }; const v = leaseView(l, ctx); return { tenant: v.tenant, suite: v.suite, sf: v.sf, monthlyRent: v.monthlyRent, annualRent: round2(v.monthlyRent * 12), rentPerSFYear: v.sf ? round2(v.monthlyRent * 12 / v.sf) : null }; }
  const prop = args.property ? propMatch(args.property, ctx) : null;
  let leases = (ctx.E.leases || []).filter((l) => Number(l.monthlyRent) > 0 && l.status !== "owner-occupant");
  if (prop) leases = leases.filter((l) => l.propertyId === prop.id);
  if (args.building) leases = leases.filter((l) => buildingMatches(args.building, (ctx.bldgById.get((ctx.unitById.get(l.unitId) || {}).buildingId) || {}).name || ""));
  if (!leases.length) return { note: "No leases found." };
  let sf = 0, rent = 0; for (const l of leases) { sf += Number((ctx.unitById.get(l.unitId) || {}).sf) || 0; rent += Number(l.monthlyRent); }
  return { scope: (prop ? prop.name : "all") + (args.building ? " / " + args.building : ""), totalSF: sf, annualRent: round2(rent * 12), blendedRentPerSFYear: sf ? round2(rent * 12 / sf) : null };
}

export function occupancy_outlook(args, ctx) {
  let target = args.property ? propMatch(args.property, ctx) : null;
  if (!target) target = (ctx.E.properties || []).find((p) => /commercial/i.test(p.type || "")) || null;
  if (!target) return { note: "Occupancy outlook is available for commercial properties." };
  const vp = (ctx.vm.PROPERTIES || []).find((x) => x.slug === target.id) || {};
  if (vp.totalSF == null) return { note: `${target.name} is unit-based, not SF — ask for its occupancy summary instead.` };
  const totalSF = vp.totalSF, occNow = vp.occupiedSF || 0, today = ctx.today, curYear = today.getFullYear();
  const leases = (ctx.E.leases || []).filter((l) => l.propertyId === target.id && Number(l.monthlyRent) > 0 && l.status !== "owner-occupant" && (l.terminates || l.status === "vacating"));
  let maxYear = curYear; const expByYear = {};
  for (const l of leases) {
    if (committedForward(l, today)) continue;
    const d = l.vacateDate || l.terminates; if (!d) continue; const dt = new Date(d); if (dt < today) continue;
    const y = dt.getFullYear(); if (y > maxYear) maxYear = y;
    const sf = Number((ctx.unitById.get(l.unitId) || {}).sf) || 0;
    const e = expByYear[y] = expByYear[y] || { sf: 0, tenants: [] }; e.sf += sf; e.tenants.push((ctx.tenantById.get(l.tenantId) || {}).name);
  }
  maxYear = Math.min(maxYear, curYear + 6);
  let remaining = occNow; const byYear = [];
  for (let y = curYear; y <= maxYear; y++) { const e = expByYear[y] || { sf: 0, tenants: [] }; remaining -= e.sf; byYear.push({ year: y, rollOffSF: e.sf, tenants: e.tenants, committedSF: Math.max(remaining, 0), committedOccupancyPct: totalSF ? round2(100 * Math.max(remaining, 0) / totalSF) : null }); }
  return { property: target.name, totalSF, currentOccupiedSF: occNow, currentOccupancyPct: totalSF ? round2(100 * occNow / totalSF) : null, byYear,
    note: "Committed occupancy = SF whose lease term is in place that year, assuming no renewals/backfill (auto-renew counts only until its notice date passes). A planning floor, not a forecast." };
}

export function portfolio_kpis(_args, ctx) {
  let totSF = 0, occSF = 0, totUnits = 0, occUnits = 0;
  for (const p of ctx.E.properties || []) {
    const vp = (ctx.vm.PROPERTIES || []).find((x) => x.slug === p.id) || {};
    if (vp.totalSF != null) { totSF += vp.totalSF; occSF += vp.occupiedSF || 0; }
    else { const pus = (ctx.E.units || []).filter((u) => u.propertyId === p.id); if (pus.length) { totUnits += pus.length; occUnits += (ctx.E.leases || []).filter((l) => l.propertyId === p.id && Number(l.monthlyRent) > 0).length; } }
  }
  let wsum = 0, w = 0;
  for (const l of ctx.E.leases || []) { if (!(Number(l.monthlyRent) > 0) || !l.terminates) continue; const yrs = yearsBetween(l.terminates, ctx.today); if (yrs == null || yrs < 0) continue; wsum += yrs * Number(l.monthlyRent); w += Number(l.monthlyRent); }
  return {
    commercial: { totalSF: totSF, occupiedSF: occSF, occupancyPct: totSF ? round2(100 * occSF / totSF) : null, vacancyRatePct: totSF ? round2(100 * (totSF - occSF) / totSF) : null },
    residential: { totalUnits: totUnits, occupiedUnits: occUnits, occupancyPct: totUnits ? round2(100 * occUnits / totUnits) : null },
    weightedAvgLeaseTermYears: w ? round2(wsum / w) : null,
    note: "WALT = remaining years to lease-end, weighted by monthly rent.",
  };
}

export function tenant_contact(args, ctx) {
  const scored = (ctx.E.tenants || []).map((t) => ({ s: fuzzy(args.tenant || "", t.name || ""), t })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (!scored.length) return { note: `No tenant found matching "${args.tenant}".` };
  const t = scored[0].t;
  return { tenant: t.name, contactName: t.contactName || null, email: t.email || null, phone: t.phone || null, note: (t.contactName || t.email || t.phone) ? undefined : "No contact details are on file for this tenant yet." };
}

export function suite_history(args, ctx) {
  const prop = args.property ? propMatch(args.property, ctx) : null;
  const suiteQ = norm(args.suite || "");
  let current = null;
  for (const l of ctx.E.leases || []) {
    const u = ctx.unitById.get(l.unitId) || {};
    if (prop && l.propertyId !== prop.id) continue;
    if (args.building && !buildingMatches(args.building, (ctx.bldgById.get(u.buildingId) || {}).name || "")) continue;
    if (suiteQ && norm(u.identifier || "").includes(suiteQ) && Number(l.monthlyRent) > 0) { const v = leaseView(l, ctx); current = { tenant: v.tenant, commenced: l.commenced, monthlyRent: v.monthlyRent }; }
  }
  const former = []; const mo = ctx.vm.MOVED_OUT || {};
  Object.keys(mo).forEach((k) => (mo[k] || []).forEach((e) => { if (suiteQ && norm(String(e.suite || "")).includes(suiteQ)) former.push({ tenant: e.tenant, building: e.building || null, term: (e.commenced || "?") + " → " + (e.terminated || "?") }); }));
  return { suite: args.suite, current, former, note: (!current && !former.length) ? "Nothing on file for that suite." : undefined };
}

// ── registry ─────────────────────────────────────────────────────────────────
const REGISTRY = { find_tenant, get_lease_documents, building_or_property_rent, portfolio_totals, property_summary, expiring_leases, vacancies, insurance_status, monthly_rent_roll,
  next_rent_increase, lease_action, notice_deadlines, building_directory, space_search, rent_per_sf, occupancy_outlook, portfolio_kpis, tenant_contact, suite_history };

// A tiny directory so the model knows what exists and can route tool calls.
export function directoryText(ctx) {
  const lines = ["Properties (use these names when calling tools):"];
  for (const p of ctx.E.properties || []) lines.push(`- ${p.name} (${p.type || "?"})`);
  const sopB = (ctx.E.buildings || []).filter((b) => b.propertyId === "sanctuary-office-park").map((b) => b.name).sort();
  if (sopB.length) lines.push(`Sanctuary Office Park buildings: ${sopB.join(", ")}.`);
  return lines.join("\n");
}

export function runTool(name, args, ctx) {
  const fn = REGISTRY[name];
  if (!fn) return { error: `Unknown tool: ${name}` };
  try { return fn(args || {}, ctx); } catch (e) { return { error: String((e && e.message) || e) }; }
}

// Tool definitions (OpenAI/Groq function-calling schema). Descriptions are kept
// terse because they are re-sent to the model on every round of the loop.
export const TOOL_DEFS = [
  { type: "function", function: { name: "find_tenant", description: "A tenant's lease facts: property/building/suite, SF, monthly rent, dates, escalation, auto-renew, notice, status.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "get_lease_documents", description: "Lease/amendment documents for a tenant, with PDF and HTML links to share. By default returns ONLY the current (most recent) document — send that one link. Set all=true ONLY when the user explicitly asks for all documents / every amendment / the full history.", parameters: { type: "object", properties: { tenant: { type: "string" }, all: { type: "boolean", description: "true only if the user asked for ALL documents/amendments, not just the current lease" } }, required: ["tenant"] } } },
  { type: "function", function: { name: "building_or_property_rent", description: "Exact total monthly and annual base rent for a property and/or a specific building (e.g. 'Building #2').", parameters: { type: "object", properties: { property: { type: "string" }, building: { type: "string" } } } } },
  { type: "function", function: { name: "portfolio_totals", description: "Portfolio-wide rent by property + portfolio total + highest-grossing property and building.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "property_summary", description: "Occupancy + rent summary for one property.", parameters: { type: "object", properties: { property: { type: "string" } }, required: ["property"] } } },
  { type: "function", function: { name: "expiring_leases", description: "Expiring/vacating leases, soonest first, flagged vacating/auto-renew/fixed-term. Optional property, throughDate (YYYY-MM-DD).", parameters: { type: "object", properties: { property: { type: "string" }, throughDate: { type: "string" } } } } },
  { type: "function", function: { name: "vacancies", description: "Vacant/available units, optionally for one property.", parameters: { type: "object", properties: { property: { type: "string" } } } } },
  { type: "function", function: { name: "insurance_status", description: "COI status (current/expiring/EXPIRED) per tenant; optional tenant or property filter.", parameters: { type: "object", properties: { tenant: { type: "string" }, property: { type: "string" } } } } },
  { type: "function", function: { name: "monthly_rent_roll", description: "Month-by-month (Jan-Dec) base rent for a tenant, or monthly totals for a property/building, in a year. Use for 'monthly rent roll' / 'rent by month' questions.", parameters: { type: "object", properties: { tenant: { type: "string" }, property: { type: "string" }, building: { type: "string" }, year: { type: "integer" } } } } },
  { type: "function", function: { name: "next_rent_increase", description: "When a tenant's rent next increases and to what amount.", parameters: { type: "object", properties: { tenant: { type: "string" } }, required: ["tenant"] } } },
  { type: "function", function: { name: "lease_action", description: "Recommended next step for a tenant's lease (renew / re-market / negotiate / cash checks) with key dates.", parameters: { type: "object", properties: { tenant: { type: "string" } }, required: ["tenant"] } } },
  { type: "function", function: { name: "notice_deadlines", description: "Upcoming renewal/termination notice deadlines, soonest first. Optional property, withinDays.", parameters: { type: "object", properties: { property: { type: "string" }, withinDays: { type: "integer" } } } } },
  { type: "function", function: { name: "building_directory", description: "Every tenant in a building or property, with suite, SF and rent.", parameters: { type: "object", properties: { property: { type: "string" }, building: { type: "string" } } } } },
  { type: "function", function: { name: "space_search", description: "Vacant/available units matching a size range. Optional property, minSF, maxSF.", parameters: { type: "object", properties: { property: { type: "string" }, minSF: { type: "integer" }, maxSF: { type: "integer" } } } } },
  { type: "function", function: { name: "rent_per_sf", description: "$/SF per year for a tenant, building, or property.", parameters: { type: "object", properties: { tenant: { type: "string" }, property: { type: "string" }, building: { type: "string" } } } } },
  { type: "function", function: { name: "occupancy_outlook", description: "Committed-occupancy projection by year for a commercial property — when space rolls off and leasing is needed.", parameters: { type: "object", properties: { property: { type: "string" } } } } },
  { type: "function", function: { name: "portfolio_kpis", description: "Vacancy rate, occupancy, weighted-average lease term (WALT), total SF/units.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "tenant_contact", description: "Contact name/email/phone for a tenant (may be unset).", parameters: { type: "object", properties: { tenant: { type: "string" } }, required: ["tenant"] } } },
  { type: "function", function: { name: "suite_history", description: "Current and former tenants of a suite.", parameters: { type: "object", properties: { suite: { type: "string" }, property: { type: "string" }, building: { type: "string" } }, required: ["suite"] } } },
];
