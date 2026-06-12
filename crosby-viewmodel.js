// crosby-viewmodel.js — derive the dashboard's render structures from Firestore
// entities. This replaces the hardcoded PROPERTIES / PROPERTY_PROFILES /
// UNIT_ROSTER / TENANT_ROSTER / LEASE_TERMS / LEASE_DOCS arrays. The renderers in
// index.html are unchanged; they consume the exact field shapes produced here.
//
// Input: entities = { properties, buildings, units, tenants, leases, hoaLots }
// Output: { PROPERTIES, PROPERTY_PROFILES, UNIT_ROSTER, TENANT_ROSTER, LEASE_TERMS, LEASE_DOCS }

const DAY = 86400000;
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const daysBetween = (iso, today) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return Math.round((Date.parse(iso) - today) / DAY);
};
const docTypeOf = (file) => {
  if (!file) return "Init";
  const m = file.match(/AMD\s*_?(\d+)/i);
  return m ? "AMD" + m[1] : (/AMD/i.test(file) ? "AMD" : "Init");
};

export function deriveViewModel(entities) {
  const today = Date.now();
  const props = entities.properties || [];
  const buildings = entities.buildings || [];
  const units = entities.units || [];
  const tenants = entities.tenants || [];
  const leases = entities.leases || [];
  const hoaLots = entities.hoaLots || [];

  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const leaseByUnit = new Map(leases.map((l) => [l.unitId, l]));
  const unitsByProp = groupBy(units, "propertyId");
  const unitsByBldg = groupBy(units, "buildingId");
  const leasesByProp = groupBy(leases, "propertyId");
  const buildingsByProp = groupBy(buildings, "propertyId");
  const lotsByProp = groupBy(hoaLots, "propertyId");

  const PROPERTY_PROFILES = {};
  const UNIT_ROSTER = {};
  const TENANT_ROSTER = {};
  const LEASE_TERMS = {};
  const LEASE_DOCS = {};
  const PROPERTIES = [];

  for (const p of props) {
    if (p.profile) PROPERTY_PROFILES[p.id] = p.profile;

    const pUnits = unitsByProp[p.id] || [];
    const pLeases = leasesByProp[p.id] || [];
    const pBldgs = (buildingsByProp[p.id] || []).slice().sort(byName);
    const pLots = lotsByProp[p.id] || [];
    const hasData = pUnits.length > 0 || pLots.length > 0;

    const base = {
      slug: p.id, name: p.name, location: p.location || [p.city, p.state].filter(Boolean).join(", "),
      cls: p.cls || p.type || "—", isCommercial: !!p.isCommercial, isHOA: !!p.isHOA,
      status: hasData ? "data-loaded" : "pending",
      unitMix: p.unitMix || null,
    };

    if (p.isCommercial) {
      Object.assign(base, deriveCommercial(p, pBldgs, unitsByBldg, leaseByUnit, tenantById, pLeases));
      TENANT_ROSTER[p.id] = base._tenantRoster; delete base._tenantRoster;
      LEASE_TERMS[p.id] = base._leaseTerms; delete base._leaseTerms;
      LEASE_DOCS[p.id] = base._leaseDocs; delete base._leaseDocs;
    } else if (p.isHOA) {
      Object.assign(base, deriveHOA(pLots));
      UNIT_ROSTER[p.id] = base._roster; delete base._roster;
    } else {
      Object.assign(base, deriveResidential(p, pUnits, pBldgs, leaseByUnit, tenantById));
      if (base._roster.length) UNIT_ROSTER[p.id] = base._roster;
      delete base._roster;
    }
    PROPERTIES.push(base);
  }

  return { PROPERTIES, PROPERTY_PROFILES, UNIT_ROSTER, TENANT_ROSTER, LEASE_TERMS, LEASE_DOCS };
}

// ── Commercial (e.g. Sanctuary Office Park) ────────────────────────────────────
function deriveCommercial(p, pBldgs, unitsByBldg, leaseByUnit, tenantById, pLeases) {
  const today = Date.now();
  const buildings = [], tenantRoster = {}, leaseTerms = {}, leaseDocs = {};
  let totalSF = 0, occSF = 0, vacSF = 0, monthly = 0, tenantCount = 0;

  for (const b of pBldgs) {
    const bUnits = (unitsByBldg[b.id] || []).slice().sort(bySuite);
    let bSF = 0, bOcc = 0, bVac = 0, bMonthly = 0, bTenants = 0;
    const roster = [], terms = [], docs = [];

    for (const u of bUnits) {
      const lease = leaseByUnit.get(u.id);
      const tenant = lease ? tenantById.get(lease.tenantId) : null;
      const vacant = u.status === "vacant" || !lease;
      bSF += u.sf || 0;
      if (vacant) { bVac += u.sf || 0; }
      else { bOcc += u.sf || 0; bMonthly += num(lease.monthlyRent); bTenants++; }

      roster.push({
        tenant: tenant ? tenant.name : "(Vacant)", suite: u.identifier, sf: u.sf || 0,
        rent: lease ? num(lease.monthlyRent) : 0, vacant,
      });

      if (lease) {
        const mtm = lease.status === "mtm", owner = lease.status === "owner-occupant";
        const term = {
          tenant: tenant ? tenant.name : u.identifier, suite: u.identifier, sf: u.sf || 0,
          commenced: lease.commenced || "—",
          terminates: mtm ? "Month-to-Month" : owner ? "Owner Occupant" : (lease.terminates || "—"),
          daysLeft: daysBetween(lease.terminates, today),
          escalation: lease.escalationPct != null ? Number(lease.escalationPct).toFixed(1) + "%" : "—",
          autoRenew: !!lease.autoRenew,
          noticeDays: lease.noticeDays != null ? lease.noticeDays : null,
          noticeDeadline: lease.noticeDeadline || null,
          noticeDeadlineDays: lease.daysToNoticeDeadline != null ? lease.daysToNoticeDeadline : daysBetween(lease.noticeDeadline, today),
          additional: lease.notes || "",
          vacating: lease.status === "vacating", mtm, ownerOccupant: owner,
        };
        terms.push(term);
        if (lease.docFile) docs.push({ tenant: tenant ? tenant.name : u.identifier, suite: u.identifier, file: lease.docFile, docType: docTypeOf(lease.docFile) });
      }
    }

    buildings.push({ name: b.name, sf: bSF || b.totalSF || 0, occupiedSF: bOcc, vacantSF: bVac, tenants: bTenants, monthly: bMonthly });
    if (roster.length) tenantRoster[b.name] = roster;
    if (terms.length) leaseTerms[b.name] = terms;
    if (docs.length) leaseDocs[b.name] = docs;
    totalSF += bSF || b.totalSF || 0; occSF += bOcc; vacSF += bVac; monthly += bMonthly; tenantCount += bTenants;
  }

  const occupancy = totalSF > 0 ? (occSF / totalSF) * 100 : 0;
  return {
    buildings, totalSF, occupiedSF: occSF, vacantSF: vacSF, monthlyRent: monthly,
    annualRent: monthly * 12, tenantCount, occupancy: Math.round(occupancy * 10) / 10,
    avgRentSF: occSF > 0 ? (monthly * 12) / occSF : 0,
    _tenantRoster: tenantRoster, _leaseTerms: leaseTerms, _leaseDocs: leaseDocs,
  };
}

// ── Residential (Metairie Plaza/Lake, Mandeville Lake) ─────────────────────────
function deriveResidential(p, pUnits, pBldgs, leaseByUnit, tenantById) {
  let occupied = 0, vacant = 0, turnover = 0;
  const roster = [];
  for (const u of pUnits.slice().sort(bySuite)) {
    const raw = u.rosterStatus || (u.status === "occupied" ? "Occupied" : "Vacant");
    if (raw === "Occupied") occupied++;
    else if (/mov/i.test(raw)) turnover++;
    else vacant++;
    const lease = leaseByUnit.get(u.id);
    const tenant = lease ? tenantById.get(lease.tenantId) : null;
    roster.push({
      unit: u.identifier, plan: u.plan || "—",
      name: tenant ? tenant.name : "", phone: tenant ? tenant.phone : "", email: tenant ? tenant.email : "",
      status: raw,
    });
  }

  const buildings = pBldgs.map((b) => ({
    name: b.name, units: b.totalUnits || 0, occupied: b.occupiedUnits || 0,
    vacant: b.vacantUnits || 0, monthly: num(b.monthlyRent),
  }));
  const bldgMonthly = buildings.reduce((s, b) => s + b.monthly, 0);

  return {
    units: pUnits.length, occupied, vacant, turnover,
    occupancy: pUnits.length > 0 ? Math.round((occupied / pUnits.length) * 100) : 0,
    monthlyRent: bldgMonthly > 0 ? bldgMonthly : null,
    buildings: buildings.length ? buildings : undefined,
    _roster: roster,
  };
}

// ── HOA (Lakeside Village) ─────────────────────────────────────────────────────
function deriveHOA(pLots) {
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const roster = pLots.slice().sort((a, b) => num(a.lotNumber) - num(b.lotNumber)).map((l) => ({
    unit: l.lotNumber, plan: cap(l.lotType), address: l.address || "—",
    owner: l.ownerName, ownerPhone: l.ownerPhone, ownerEmail: l.ownerEmail,
    name: l.tenantName, phone: l.tenantPhone, email: l.tenantEmail,
    rent: l.monthlyRent, dues: l.monthlyDues, role: l.managedBy, status: l.status,
  }));
  const cnt = (fn) => pLots.filter(fn).length;
  const rented = cnt((l) => l.status === "Rented");
  return {
    totalLots: pLots.length,
    townhomes: cnt((l) => l.lotType === "townhome"),
    cottages: cnt((l) => l.lotType === "cottage"),
    crosbyOwned: cnt((l) => l.crosbyOwned),
    crosbyManaged: cnt((l) => l.managedBy === "Crosby Managed"),
    thirdPartyManaged: cnt((l) => l.managedBy === "Third-Party Managed"),
    ownerOccupied: cnt((l) => l.managedBy === "Owner-Occupied"),
    rented,
    monthlyRent: pLots.reduce((s, l) => s + num(l.monthlyRent), 0),
    monthlyDues: pLots.reduce((s, l) => s + num(l.monthlyDues), 0),
    _roster: roster,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────
function groupBy(arr, key) {
  const out = {};
  for (const x of arr) { (out[x[key]] = out[x[key]] || []).push(x); }
  return out;
}
function byName(a, b) { return String(a.name).localeCompare(String(b.name), undefined, { numeric: true }); }
function bySuite(a, b) { return String(a.identifier).localeCompare(String(b.identifier), undefined, { numeric: true }); }
