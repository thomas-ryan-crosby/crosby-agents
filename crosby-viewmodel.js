// crosby-viewmodel.js — derive the dashboard's render structures from Firestore
// entities. This replaces the hardcoded PROPERTIES / PROPERTY_PROFILES /
// UNIT_ROSTER / TENANT_ROSTER / LEASE_TERMS / LEASE_DOCS arrays. The renderers in
// index.html are unchanged; they consume the exact field shapes produced here.
//
// Input: entities = { properties, buildings, units, tenants, leases, hoaLots }
// Output: { PROPERTIES, PROPERTY_PROFILES, UNIT_ROSTER, TENANT_ROSTER, LEASE_TERMS, LEASE_DOCS }

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

// Human "time until" a date as years/months/days, e.g. "1y 6m 20d" (or "… ago" if
// the date is past). Empty string for non-dates (—, MTM, Owner).
function humanUntil(isoStr, today) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return "";
  const t = new Date(today);
  const from = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const to = new Date(isoStr + "T00:00:00Z");
  if (to.getTime() === from.getTime()) return "today";
  const past = to < from;
  const a = past ? to : from, b = past ? from : to;
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  let months = b.getUTCMonth() - a.getUTCMonth();
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) { months--; days += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
  if (months < 0) { years--; months += 12; }
  const parts = [];
  if (years) parts.push(years + "y");
  if (months) parts.push(months + "m");
  if (days) parts.push(days + "d");
  const s = parts.join(" ") || "0d";
  return past ? s + " ago" : s;
}

// Expiry display for a roster row.
function leaseExpiry(lease) {
  if (!lease) return "—";
  if (lease.status === "mtm") return "MTM";
  if (lease.status === "owner-occupant") return "Owner";
  return /^\d{4}-\d{2}-\d{2}$/.test(lease.terminates) ? lease.terminates : "—";
}

// Urgency tone for a date, by days-from-today: red when ≤90d (or past), amber when
// ≤180d, gray when further out. Used to color the expiry/notice countdowns.
function dateTone(d) {
  if (d == null) return "neutral";
  if (d < 0 || d <= 90) return "urgent";
  if (d <= 180) return "attention";
  return "neutral";
}

// Leasing action per suite — fully derived from lease state and recomputed against
// today's date (no stored/frozen values). tone drives the badge color: steady
// (green), attention (amber), urgent (red), neutral (gray). The "binding date" is
// the NOTICE deadline for an auto-renewing lease (you must act before it) and the
// EXPIRATION for a non-renewing lease.
function leaseAction(lease, vacant, today) {
  if (vacant) return { label: "Begin Marketing", tone: "urgent" };
  if (!lease) return { label: "—", tone: "neutral" };
  if (lease.status === "owner-occupant") return { label: "Owner-Occupied", tone: "neutral" };
  if (lease.status === "vacating") return { label: "Begin Marketing", tone: "urgent" };
  if (lease.status === "mtm") return { label: "Formalize Lease", tone: "attention" };
  const expDays = daysBetween(lease.terminates, today);
  if (expDays == null) return { label: "Confirm Lease Terms", tone: "attention" }; // rent on file, dates pending
  const ndDays = daysBetween(lease.noticeDeadline, today);

  if (lease.autoRenew === true) {
    // The notice deadline is the action trigger; once it passes the lease auto-renews.
    if (ndDays == null) return expDays <= 150 ? { label: "Confirm Renewal", tone: "attention" } : { label: "Cash Checks", tone: "steady" };
    if (ndDays < 0) return { label: "Cash Checks", tone: "steady" };           // notice passed → auto-renewed
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
  // auto-renew unknown (e.g. roster-only backfill, terms unconfirmed)
  if (expDays < 0) return { label: "Expired — Verify", tone: "urgent" };
  if (expDays <= 90) return { label: "Expiring — Verify Terms", tone: "urgent" };
  if (expDays <= 180) return { label: "Verify & Plan Renewal", tone: "attention" };
  return { label: "Verify Renewal Terms", tone: "attention" };
}

// Insurance/COI status for a roster row, derived from the tenant's certificates of
// insurance and the property's required coverage. tone mirrors leaseAction: steady
// (green/compliant), attention (amber/expiring or missing), urgent (red/expired or
// below-requirement). The earliest-expiring coverage governs the overall expiration.
function deriveInsurance(cois, required, today) {
  const req = required || { glEachOccurrence: 1000000, additionalInsured: true };
  if (!cois || !cois.length) {
    return { status: "missing", label: "No COI on file", tone: "attention",
      expiry: "—", expiryIn: "", expiryTone: "neutral",
      flags: ["No certificate of insurance on file"], doc: null, docs: [], producer: null };
  }
  const coi = cois.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  const covs = coi.coverages || [];
  const exps = covs.map((c) => c.expiration).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || ""));
  const earliest = exps.sort()[0] || (/^\d{4}-\d{2}-\d{2}$/.test(coi.expiration || "") ? coi.expiration : null);
  const expDays = daysBetween(earliest, today);
  const flags = [];
  const gl = covs.find((c) => /general\s*liab/i.test(c.type || ""));
  const glEach = gl ? num(gl.eachOccurrence) : 0;
  if (req.glEachOccurrence && glEach < req.glEachOccurrence)
    flags.push("GL each-occurrence " + (glEach ? "$" + glEach.toLocaleString() : "not shown") +
      " is below the required $" + req.glEachOccurrence.toLocaleString());
  if (req.additionalInsured && coi.additionalInsured !== true)
    flags.push("Crosby not confirmed as additional insured / certificate holder");
  const expired = expDays != null && expDays < 0;
  const expiringSoon = expDays != null && expDays >= 0 && expDays <= 60;
  let status, label, tone;
  if (expired) { status = "expired"; label = "COI Expired"; tone = "urgent"; flags.unshift("Coverage expired " + earliest); }
  else if (flags.length) { status = "noncompliant"; label = "Action Needed"; tone = "urgent"; }
  else if (expiringSoon) { status = "expiring"; label = "Expiring Soon"; tone = "attention"; }
  else { status = "compliant"; label = "Compliant"; tone = "steady"; }
  const mkDoc = (c) => c.url ? { docType: "COI", date: c.date || null, url: c.url,
    htmlUrl: c.htmlUrl || null, meta: c.meta || null } : null;
  const docs = cois.slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(mkDoc).filter(Boolean);
  return { status, label, tone, expiry: earliest || "—", expiryIn: humanUntil(earliest, today),
    expiryTone: dateTone(expDays), flags, doc: docs[0] || null, docs, producer: coi.producer || null };
}

export function deriveViewModel(entities) {
  const today = Date.now();
  const props = entities.properties || [];
  const buildings = entities.buildings || [];
  const units = entities.units || [];
  const tenants = entities.tenants || [];
  const leases = entities.leases || [];
  const hoaLots = entities.hoaLots || [];

  const leaseDocsEnt = entities.leaseDocs || [];
  const coisEnt = entities.cois || [];
  const coisByProp = groupBy(coisEnt, "propertyId");
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const leaseByUnit = new Map(leases.map((l) => [l.unitId, l]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  // Escalation lookup keyed by "tenantName||unitIdentifier" so each lease doc can
  // surface the lease's escalation percentage and the month it applies.
  const FULL_MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const escByKey = {};
  for (const l of leases) {
    if (l.escalationPct == null) continue;
    const u = unitById.get(l.unitId), t = tenantById.get(l.tenantId);
    if (!u || !t) continue;
    escByKey[t.name + "||" + u.identifier] = {
      pct: Number(l.escalationPct),
      month: l.escalationMonth || null,
      date: l.escalationMonth ? FULL_MONTHS[l.escalationMonth - 1] : null,
    };
  }
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
  const MOVED_OUT = {};
  const TERMINATIONS = {};
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
      marketInfoUrl: p.marketInfoUrl || null,
    };

    if (p.isCommercial) {
      const coiByName = {};
      for (const c of (coisByProp[p.id] || [])) (coiByName[c.tenant] = coiByName[c.tenant] || []).push(c);
      Object.assign(base, deriveCommercial(p, pBldgs, unitsByBldg, leaseByUnit, tenantById, pLeases, coiByName));
      TENANT_ROSTER[p.id] = base._tenantRoster; delete base._tenantRoster;
      LEASE_TERMS[p.id] = base._leaseTerms; delete base._leaseTerms;
      if (base._terminations && base._terminations.length) TERMINATIONS[p.id] = base._terminations;
      delete base._terminations;
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

  // LEASE_DOCS (active) grouped by propertyId -> building; MOVED_OUT collected separately.
  for (const d of leaseDocsEnt) {
    if (!d.tenant || !d.propertyId) continue; // skip unmatched/unlinked
    const esc = escByKey[d.tenant + "||" + d.suite];
    const dMeta = esc
      ? Object.assign({}, d.meta || {}, { escalationPct: esc.pct, escalationMonth: esc.month, escalationDate: esc.date })
      : (d.meta || null);
    const docView = { tenant: d.tenant, suite: d.suite, file: d.file, docType: d.docType,
      url: d.url, htmlUrl: d.htmlUrl || null, meta: dMeta, date: d.date || null };
    if (d.movedOut) {
      const arr = MOVED_OUT[d.propertyId] || (MOVED_OUT[d.propertyId] = []);
      let e = arr.find((x) => x.tenant === d.tenant && x.suite === d.suite);
      if (!e) {
        const m = d.meta || {};
        e = { tenant: d.tenant, suite: d.suite, building: d.building,
          commenced: m.commencement || null, terminated: m.termination || null,
          rent: m.monthlyRent || null, replacedBy: d.replacedBy || null, docs: [] };
        arr.push(e);
      }
      e.docs.push(docView);
      continue;
    }
    if (!d.building) continue;
    const byProp = LEASE_DOCS[d.propertyId] || (LEASE_DOCS[d.propertyId] = {});
    (byProp[d.building] || (byProp[d.building] = [])).push(docView);
  }
  // sort each moved-out tenant's docs newest-first; sort tenants by suite
  Object.keys(MOVED_OUT).forEach((k) => {
    MOVED_OUT[k].forEach((e) => e.docs.sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))));
    MOVED_OUT[k].sort((a, b) => String(a.suite).localeCompare(String(b.suite), undefined, { numeric: true }));
  });

  return { PROPERTIES, PROPERTY_PROFILES, UNIT_ROSTER, TENANT_ROSTER, LEASE_TERMS, LEASE_DOCS, MOVED_OUT, TERMINATIONS };
}

// ── Commercial (e.g. Sanctuary Office Park) ────────────────────────────────────
function deriveCommercial(p, pBldgs, unitsByBldg, leaseByUnit, tenantById, pLeases, coiByName) {
  const today = Date.now();
  const required = p.requiredInsurance || { glEachOccurrence: 1000000, additionalInsured: true };
  const buildings = [], tenantRoster = {}, leaseTerms = {}, terminations = [];
  let totalSF = 0, occSF = 0, vacSF = 0, monthly = 0, tenantCount = 0;

  for (const b of pBldgs) {
    const bUnits = (unitsByBldg[b.id] || []).slice().sort(bySuite);
    let bSF = 0, bOcc = 0, bVac = 0, bMonthly = 0, bTenants = 0;
    const roster = [], terms = [];

    for (const u of bUnits) {
      const lease = leaseByUnit.get(u.id);
      const tenant = lease ? tenantById.get(lease.tenantId) : null;
      const vacant = u.status === "vacant" || !lease;
      bSF += u.sf || 0;
      if (vacant) { bVac += u.sf || 0; }
      else { bOcc += u.sf || 0; bMonthly += num(lease.monthlyRent); bTenants++; }

      roster.push({
        tenant: tenant ? tenant.name : "(Vacant)", tenantId: tenant ? tenant.id : null, suite: u.identifier, sf: u.sf || 0,
        rent: lease ? num(lease.monthlyRent) : 0, vacant,
        commenced: (lease && lease.commenced) || "—",
        escalation: (lease && lease.escalationPct != null)
          ? Number(lease.escalationPct).toFixed(1) + "%" + " (" + (lease.escalationMonth ? MONTHS[lease.escalationMonth - 1] : "?") + ")"
          : "—",
        autoRenew: lease ? (lease.autoRenew == null ? null : !!lease.autoRenew) : null,
        expiry: leaseExpiry(lease),
        expiryIn: humanUntil(lease && lease.terminates, today),
        expiryTone: lease ? dateTone(daysBetween(lease.terminates, today)) : "neutral",
        notice: (lease && lease.noticeDeadline) || "—",
        noticeIn: humanUntil(lease && lease.noticeDeadline, today),
        noticeTone: lease ? dateTone(daysBetween(lease.noticeDeadline, today)) : "neutral",
        action: leaseAction(lease, vacant, today),
        insurance: vacant ? null : deriveInsurance((coiByName || {})[tenant && tenant.name], required, today),
        suiteNote: (lease && lease.suiteFlag) || null,
      });

      // Collect tenants who have given termination/vacate notice (status "vacating"
      // or an explicit vacateDate) into a property-level Terminations list.
      if (lease && (lease.status === "vacating" || lease.vacateDate)) {
        const vd = lease.vacateDate || null;
        terminations.push({
          tenant: tenant ? tenant.name : u.identifier, building: b.name, suite: u.identifier, sf: u.sf || 0,
          rent: num(lease.monthlyRent), vacateDate: vd,
          vacateIn: vd ? humanUntil(vd, today) : "", vacateTone: dateTone(daysBetween(vd, today)),
          hardDate: !!vd,
        });
      }

      if (lease) {
        const mtm = lease.status === "mtm", owner = lease.status === "owner-occupant";
        const term = {
          tenant: tenant ? tenant.name : u.identifier, suite: u.identifier, sf: u.sf || 0,
          commenced: lease.commenced || "—",
          terminates: mtm ? "Month-to-Month" : owner ? "Owner Occupant" : (lease.terminates || "—"),
          daysLeft: daysBetween(lease.terminates, today),
          escalation: lease.escalationPct != null
            ? Number(lease.escalationPct).toFixed(1) + "%" + " (" + (lease.escalationMonth ? MONTHS[lease.escalationMonth - 1] : "?") + ")"
            : "—",
          escalationMonth: lease.escalationMonth || null,
          autoRenew: lease.autoRenew == null ? null : !!lease.autoRenew,
          noticeDays: lease.noticeDays != null ? lease.noticeDays : null,
          noticeDeadline: lease.noticeDeadline || null,
          noticeDeadlineDays: daysBetween(lease.noticeDeadline, today),
          additional: lease.notes || "",
          vacating: lease.status === "vacating", mtm, ownerOccupant: owner,
        };
        terms.push(term);
      }
    }

    buildings.push({ name: b.name, sf: bSF || b.totalSF || 0, occupiedSF: bOcc, vacantSF: bVac, tenants: bTenants, monthly: bMonthly });
    if (roster.length) tenantRoster[b.name] = roster;
    if (terms.length) leaseTerms[b.name] = terms;
    totalSF += bSF || b.totalSF || 0; occSF += bOcc; vacSF += bVac; monthly += bMonthly; tenantCount += bTenants;
  }

  const occupancy = totalSF > 0 ? (occSF / totalSF) * 100 : 0;
  return {
    buildings, totalSF, occupiedSF: occSF, vacantSF: vacSF, monthlyRent: monthly,
    annualRent: monthly * 12, tenantCount, occupancy: Math.round(occupancy * 10) / 10,
    avgRentSF: occSF > 0 ? (monthly * 12) / occSF : 0,
    _tenantRoster: tenantRoster, _leaseTerms: leaseTerms,
    _terminations: terminations.sort((a, b) => String(a.vacateDate || "9999").localeCompare(String(b.vacateDate || "9999"))),
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
