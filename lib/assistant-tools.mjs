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
  const scored = (ctx.E.leaseDocs || [])
    .map((d) => ({ score: fuzzy(name, d.tenant || ""), d }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  if (!scored.length) return { documents: [], note: `No lease documents on file matching "${name}".` };
  return {
    documents: scored.map((x) => ({
      tenant: x.d.tenant, docType: x.d.docType, building: x.d.building || null, suite: x.d.suite || null,
      dated: x.d.date || (x.d.meta && x.d.meta.dated) || null, title: (x.d.meta && x.d.meta.title) || null,
      pdf: x.d.url || null, html: x.d.htmlUrl || null,
    })),
    note: "Share the html link when available, otherwise the pdf link.",
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

// ── registry ─────────────────────────────────────────────────────────────────
const REGISTRY = { find_tenant, get_lease_documents, building_or_property_rent, portfolio_totals, property_summary, expiring_leases, vacancies, insurance_status, monthly_rent_roll };

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
  { type: "function", function: { name: "get_lease_documents", description: "Lease/amendment documents for a tenant, with PDF and HTML links to share.", parameters: { type: "object", properties: { tenant: { type: "string" } }, required: ["tenant"] } } },
  { type: "function", function: { name: "building_or_property_rent", description: "Exact total monthly and annual base rent for a property and/or a specific building (e.g. 'Building #2').", parameters: { type: "object", properties: { property: { type: "string" }, building: { type: "string" } } } } },
  { type: "function", function: { name: "portfolio_totals", description: "Portfolio-wide rent by property + portfolio total + highest-grossing property and building.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "property_summary", description: "Occupancy + rent summary for one property.", parameters: { type: "object", properties: { property: { type: "string" } }, required: ["property"] } } },
  { type: "function", function: { name: "expiring_leases", description: "Expiring/vacating leases, soonest first, flagged vacating/auto-renew/fixed-term. Optional property, throughDate (YYYY-MM-DD).", parameters: { type: "object", properties: { property: { type: "string" }, throughDate: { type: "string" } } } } },
  { type: "function", function: { name: "vacancies", description: "Vacant/available units, optionally for one property.", parameters: { type: "object", properties: { property: { type: "string" } } } } },
  { type: "function", function: { name: "insurance_status", description: "COI status (current/expiring/EXPIRED) per tenant; optional tenant or property filter.", parameters: { type: "object", properties: { tenant: { type: "string" }, property: { type: "string" } } } } },
  { type: "function", function: { name: "monthly_rent_roll", description: "Month-by-month (Jan-Dec) base rent for a tenant, or monthly totals for a property/building, in a year. Use for 'monthly rent roll' / 'rent by month' questions.", parameters: { type: "object", properties: { tenant: { type: "string" }, property: { type: "string" }, building: { type: "string" }, year: { type: "integer" } } } } },
];
