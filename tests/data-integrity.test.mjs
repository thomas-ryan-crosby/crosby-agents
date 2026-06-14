// Data-integrity tests: every data/*.json parses, ids are unique, and all
// cross-references (lease→unit/tenant/building/property, etc.) resolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLocalEntities } from "./_helpers.mjs";

const E = loadLocalEntities();
const ids = (arr) => new Set(arr.map((x) => x.id));

test("every collection is a non-empty array", () => {
  for (const k of ["properties", "buildings", "units", "tenants", "leases", "leaseDocs", "cois", "contacts"]) {
    assert.ok(Array.isArray(E[k]), `${k} is an array`);
    assert.ok(E[k].length > 0, `${k} is non-empty`);
  }
});

test("ids are unique within each collection", () => {
  for (const k of ["properties", "buildings", "units", "tenants", "leases", "leaseDocs", "cois", "contacts"]) {
    const seen = new Map();
    for (const x of E[k]) {
      assert.ok(x.id != null && x.id !== "", `${k} record missing id`);
      assert.ok(!seen.has(x.id), `${k} duplicate id: ${x.id}`);
      seen.set(x.id, true);
    }
  }
});

test("buildings reference an existing property", () => {
  const props = ids(E.properties);
  for (const b of E.buildings) assert.ok(props.has(b.propertyId), `building ${b.id} → unknown property ${b.propertyId}`);
});

test("units reference an existing property and (if set) building", () => {
  const props = ids(E.properties), blds = ids(E.buildings);
  for (const u of E.units) {
    assert.ok(props.has(u.propertyId), `unit ${u.id} → unknown property ${u.propertyId}`);
    if (u.buildingId) assert.ok(blds.has(u.buildingId), `unit ${u.id} → unknown building ${u.buildingId}`);
  }
});

test("leases resolve unit, tenant, property and building", () => {
  const units = ids(E.units), tenants = ids(E.tenants), props = ids(E.properties), blds = ids(E.buildings);
  for (const l of E.leases) {
    assert.ok(units.has(l.unitId), `lease ${l.id} → unknown unit ${l.unitId}`);
    assert.ok(tenants.has(l.tenantId), `lease ${l.id} → unknown tenant ${l.tenantId}`);
    assert.ok(props.has(l.propertyId), `lease ${l.id} → unknown property ${l.propertyId}`);
    if (l.buildingId) assert.ok(blds.has(l.buildingId), `lease ${l.id} → unknown building ${l.buildingId}`);
  }
});

test("lease numeric fields are sane (no NaN, non-negative rent/escalation)", () => {
  for (const l of E.leases) {
    if (l.monthlyRent != null) {
      assert.ok(Number.isFinite(Number(l.monthlyRent)), `lease ${l.id} monthlyRent not numeric`);
      assert.ok(Number(l.monthlyRent) >= 0, `lease ${l.id} negative rent`);
    }
    if (l.escalationPct != null) assert.ok(Number(l.escalationPct) >= 0 && Number(l.escalationPct) < 25, `lease ${l.id} odd escalation`);
    if (l.escalationMonth != null) assert.ok(l.escalationMonth >= 1 && l.escalationMonth <= 12, `lease ${l.id} bad escalationMonth`);
  }
});

test("lease date fields parse and commenced ≤ terminates", () => {
  for (const l of E.leases) {
    for (const f of ["commenced", "terminates", "noticeDeadline", "vacateDate"]) {
      if (l[f]) assert.ok(!isNaN(new Date(l[f])), `lease ${l.id}.${f} unparseable: ${l[f]}`);
    }
    if (l.commenced && l.terminates) {
      assert.ok(new Date(l.commenced) <= new Date(l.terminates), `lease ${l.id} commenced after terminates`);
    }
  }
});

test("leaseDocs reference an existing property and carry a usable link", () => {
  const props = ids(E.properties);
  for (const d of E.leaseDocs) {
    assert.ok(props.has(d.propertyId), `leaseDoc ${d.id} → unknown property ${d.propertyId}`);
    assert.ok(d.url || d.htmlUrl, `leaseDoc ${d.id} has no url/htmlUrl`);
    if (d.url) assert.match(d.url, /^https:\/\//, `leaseDoc ${d.id} url not https`);
  }
});

test("cois reference an existing property (when set) and name a tenant", () => {
  const props = ids(E.properties);
  for (const c of E.cois) {
    assert.ok(c.tenant, `coi ${c.id} missing tenant`);
    if (c.propertyId) assert.ok(props.has(c.propertyId), `coi ${c.id} → unknown property ${c.propertyId}`);
  }
});

test("contacts with a tenantId resolve to a tenant", () => {
  const tenants = ids(E.tenants);
  for (const c of E.contacts) {
    if (c.tenantId) assert.ok(tenants.has(c.tenantId), `contact ${c.id} → unknown tenant ${c.tenantId}`);
  }
});

test("no two active commercial leases occupy the same unit", () => {
  const seen = new Map();
  for (const l of E.leases) {
    if (l.status === "owner-occupant") continue;
    if (!(Number(l.monthlyRent) > 0)) continue;
    if (l.status && /vacat|terminated|expired|former/i.test(l.status)) continue;
    if (seen.has(l.unitId)) {
      // allow if one is clearly historical; flag genuine active double-booking
      assert.fail(`unit ${l.unitId} double-booked by active leases ${seen.get(l.unitId)} and ${l.id}`);
    }
    seen.set(l.unitId, l.id);
  }
});

test("Dianne's 305B lease is present and fully linked (regression)", () => {
  const lease = E.leases.find((l) => l.id === "lease-bldg1-suite305b-diannes");
  assert.ok(lease, "Dianne lease present");
  assert.equal(lease.docFile, "Diannes_BLDG1_STE305B_Init.pdf");
  const doc = E.leaseDocs.find((d) => d.id === "leasedoc-diannesbldg1ste305binit");
  assert.ok(doc, "Dianne leaseDoc present");
  assert.equal(doc.file, lease.docFile, "lease.docFile links to leaseDoc.file");
  const tenant = E.tenants.find((t) => t.id === "tenant-diannes-esthetics");
  assert.equal(tenant.name, "Dianne's Esthetic and Waxing");
});
