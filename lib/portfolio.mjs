// Shared portfolio data access + snapshot builder for the chat assistant.
// Reads the same Firestore collections the dashboard uses (PII stays in the
// auth-gated database, never in the Vercel static bundle), runs the same
// derivation (crosby-viewmodel.js), and renders a compact text snapshot that
// the assistant model answers questions from.
import { initializeApp, cert, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { deriveViewModel } from "../crosby-viewmodel.js";

function db() {
  if (!getApps().length) {
    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp({ credential: saRaw ? cert(JSON.parse(saRaw)) : applicationDefault() });
  }
  return getFirestore();
}

const COLLECTIONS = {
  properties: "properties", buildings: "buildings", units: "units", tenants: "tenants",
  leases: "leases", hoaLots: "hoaLots", cois: "cois", leaseDocs: "leaseDocs",
};

export async function loadEntities() {
  const d = db();
  const out = {};
  await Promise.all(Object.entries(COLLECTIONS).map(async ([key, col]) => {
    const snap = await d.collection(col).get();
    out[key] = snap.docs.map((x) => x.data());
  }));
  return out;
}

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Build a compact, complete text digest of the portfolio for the assistant.
export function snapshotFromEntities(E, todayISO) {
  const vm = deriveViewModel(E);
  const unitById = new Map((E.units || []).map((u) => [u.id, u]));
  const tenantById = new Map((E.tenants || []).map((t) => [t.id, t]));
  const bldgById = new Map((E.buildings || []).map((b) => [b.id, b]));
  const propById = new Map((E.properties || []).map((p) => [p.id, p]));
  const L = [];
  L.push(`CROSBY DEVELOPMENT — PORTFOLIO SNAPSHOT (live data; "today" = ${todayISO})`);
  L.push("Context: Sanctuary Office Park leases are full-service gross — landlord pays utilities, real-estate taxes and janitorial; no CAM charges or year-end chargebacks. Rents below are monthly base rent.");
  L.push("");

  // Properties + occupancy
  L.push("=== PROPERTIES ===");
  for (const p of E.properties || []) {
    const vp = (vm.PROPERTIES || []).find((x) => x.slug === p.id) || {};
    L.push(`- ${p.name} [${p.id}] · ${p.type || ""} · ${p.location || p.city || ""}`);
    if (vp.totalSF != null) {
      const occ = vp.totalSF ? (100 * (vp.occupiedSF || 0) / vp.totalSF).toFixed(1) + "%" : "n/a";
      L.push(`    ${vp.totalSF.toLocaleString()} SF · occupancy ${occ} (${(vp.occupiedSF || 0).toLocaleString()} leased / ${(vp.vacantSF || 0).toLocaleString()} vacant) · base rent ${money(vp.monthlyRent)}/mo`);
    } else if (vp.units != null) {
      L.push(`    ${vp.units} units · ${vp.rented || 0} occupied · ${money(vp.monthlyRent || vp.monthlyDues)}/mo`);
    }
  }
  L.push("");

  // Active leases (the authoritative per-tenant facts)
  L.push("=== LEASES (active records) ===");
  L.push("each line: TENANT | PROPERTY / BUILDING / SUITE | SF | base $/mo | commenced→terminates | escalation | renewal | notice deadline | status");
  for (const l of E.leases || []) {
    const u = unitById.get(l.unitId) || {}, t = tenantById.get(l.tenantId) || {}, b = bldgById.get(u.buildingId) || {}, p = propById.get(l.propertyId) || {};
    const esc = l.escalationPct != null ? (l.escalationPct + "%" + (l.escalationMonth ? " each " + MONTHS[l.escalationMonth - 1] : "")) : "—";
    const renew = l.autoRenew === true ? "auto-renew" : (l.autoRenew === false ? "fixed-term" : "?");
    const term = l.terminates || (l.status === "mtm" ? "month-to-month" : "—");
    L.push(`${t.name || u.identifier || "?"} | ${p.name || l.propertyId} / ${b.name || "—"} / ${u.identifier || "—"} | ${u.sf || 0} SF | ${money(l.monthlyRent)} | ${l.commenced || "?"}→${term} | ${esc} | ${renew} | ${l.noticeDeadline || "—"} | ${l.status || "active"}`);
  }
  L.push("");

  // Vacant / available units
  const vacant = (E.units || []).filter((u) => u.status === "vacant");
  if (vacant.length) {
    L.push("=== VACANT / AVAILABLE UNITS ===");
    for (const u of vacant) {
      const b = bldgById.get(u.buildingId) || {}, p = propById.get(u.propertyId) || {};
      L.push(`${p.name || u.propertyId} / ${b.name || "—"} / ${u.identifier || "—"} · ${u.sf || 0} SF`);
    }
    L.push("");
  }

  // Tenants on notice / vacating (from derived terminations)
  const termMap = vm.TERMINATIONS || {};
  const tlist = [];
  Object.keys(termMap).forEach((k) => (termMap[k] || []).forEach((x) => tlist.push(x)));
  if (tlist.length) {
    L.push("=== TENANTS ON NOTICE / VACATING (space to back-fill) ===");
    tlist.forEach((x) => L.push(`${x.tenant} · ${x.building || ""} ${x.suite || ""} · vacate ${x.vacateDate || "wind-down (no fixed date)"} · ${money(x.rent)}/mo`));
    L.push("");
  }

  // Certificates of insurance
  if ((E.cois || []).length) {
    L.push("=== CERTIFICATES OF INSURANCE ===");
    for (const c of E.cois) {
      const gl = (c.coverages || []).find((x) => /general\s*liab/i.test(x.type || "")) || (c.coverages || [])[0] || {};
      L.push(`${c.tenant} (${c.building || ""} ${c.suite || ""}) · carrier ${(c.meta && c.meta.carrier) || c.producer || "?"} · GL ${gl.eachOccurrence ? "$" + Number(gl.eachOccurrence).toLocaleString() : "?"} · expires ${c.expiration || "?"}`);
    }
    L.push("");
  }

  return L.join("\n");
}

export async function buildSnapshot(todayISO) {
  return snapshotFromEntities(await loadEntities(), todayISO);
}
