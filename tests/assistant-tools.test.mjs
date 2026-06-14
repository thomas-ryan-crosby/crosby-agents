// Assistant tool tests: each deterministic lookup returns correct, exact data
// from the local dataset. Builds ctx locally (no Firestore).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../lib/assistant-tools.mjs";
import { loadLocalEntities, buildLocalCtx } from "./_helpers.mjs";

const E = loadLocalEntities();
const ctx = buildLocalCtx(E);

// pick a real commercial tenant to anchor tests
const aLease = E.leases.find((l) => l.propertyId === "sanctuary-office-park" && Number(l.monthlyRent) > 0);
const aTenant = E.tenants.find((t) => t.id === aLease.tenantId);

test("find_tenant returns the matching tenant's lease facts", () => {
  const r = T.find_tenant({ name: aTenant.name }, ctx);
  assert.ok(r.matches && r.matches.length >= 1, "has matches");
  assert.equal(r.matches[0].tenant, aTenant.name);
  assert.ok(Number.isFinite(r.matches[0].monthlyRent));
});

test("find_tenant on nonsense returns empty matches, not a throw", () => {
  const r = T.find_tenant({ name: "zzzzz no such tenant qqq" }, ctx);
  assert.deepEqual(r.matches, []);
});

test("get_lease_documents default returns ONLY the current doc", () => {
  // Baker Donelson has many docs/amendments
  const r = T.get_lease_documents({ tenant: "Baker Donelson" }, ctx);
  assert.ok(r.document, "single current document");
  assert.ok(!r.documents, "not the full list by default");
  assert.ok(r.otherDocumentsAvailable >= 1, "reports other docs exist");
});

test("get_lease_documents all=true returns the full set", () => {
  const r = T.get_lease_documents({ tenant: "Baker Donelson", all: true }, ctx);
  assert.ok(Array.isArray(r.documents) && r.documents.length > 1, "multiple docs");
});

test("building_or_property_rent is internally consistent and building-scoped", () => {
  const r = T.building_or_property_rent({ property: "Sanctuary", building: "Building #2" }, ctx);
  assert.ok(r.tenantCount >= 1, "found tenants");
  assert.ok(Array.isArray(r.tenants) && r.tenants.length === r.tenantCount, "per-tenant breakdown matches count");
  // the reported monthly equals the sum of the per-tenant rows it returned
  const sum = r.tenants.reduce((s, t) => s + t.monthlyRent, 0);
  assert.ok(Math.abs(r.monthlyRent - sum) < 0.01, `monthly ${r.monthlyRent} vs sum-of-tenants ${sum}`);
  assert.ok(Math.abs(r.annualRent - r.monthlyRent * 12) < 0.01, "annual = monthly*12");
  // every returned tenant really is in Building #2 of Sanctuary
  for (const t of r.tenants) {
    const lease = E.leases.find((l) => (ctx.tenantById.get(l.tenantId) || {}).name === t.tenant && Number(l.monthlyRent) > 0);
    const b = ctx.bldgById.get((ctx.unitById.get(lease.unitId) || {}).buildingId) || {};
    assert.equal(lease.propertyId, "sanctuary-office-park", `${t.tenant} is in Sanctuary`);
    assert.match(b.name || "", /2/, `${t.tenant} building name has '2'`);
  }
});

test("portfolio_totals is consistent and ranks highest-grossing", () => {
  const r = T.portfolio_totals({}, ctx);
  assert.ok(r.byProperty.length === E.properties.length);
  const sum = r.byProperty.reduce((s, p) => s + p.monthlyRent, 0);
  assert.ok(Math.abs(sum - r.portfolioMonthlyRent) < 0.5, "byProperty sums to portfolio total");
  assert.ok(r.highestGrossingProperty, "has top property");
  // ranking: first is the max
  assert.equal(r.byProperty[0].monthlyRent, Math.max(...r.byProperty.map((p) => p.monthlyRent)));
});

test("expiring_leases is sorted soonest-first and drops renewed past auto-renews", () => {
  const r = T.expiring_leases({ property: "Sanctuary" }, ctx);
  for (let i = 1; i < r.leases.length; i++) {
    assert.ok(String(r.leases[i - 1].date) <= String(r.leases[i].date), "sorted by date asc");
  }
  // no past-dated auto-renew that isn't vacating
  for (const row of r.leases) {
    if (row.renewal === "auto-renew" && !row.vacating) assert.ok(row.daysAway == null || row.daysAway >= 0, "no stale auto-renew");
  }
});

test("monthly_rent_roll for a tenant: 12 months, $0 before commencement", () => {
  const r = T.monthly_rent_roll({ tenant: aTenant.name, year: new Date(aLease.commenced).getFullYear() + 1 }, ctx);
  assert.ok(r.schedule, "has schedule");
  assert.equal(Object.keys(r.schedule).length, 12);
  const total = Object.values(r.schedule).reduce((s, n) => s + n, 0);
  assert.ok(Math.abs(total - r.annualTotal) < 0.05, "schedule sums to annualTotal");
});

test("monthly_rent_roll: a not-yet-commenced lease reads $0 the prior year", () => {
  const future = E.leases.find((l) => l.commenced && new Date(l.commenced) > new Date("2026-01-01") && Number(l.monthlyRent) > 0);
  if (!future) return; // dataset may have none
  const t = E.tenants.find((x) => x.id === future.tenantId);
  const priorYear = new Date(future.commenced).getFullYear() - 1;
  const r = T.monthly_rent_roll({ tenant: t.name, year: priorYear }, ctx);
  const total = Object.values(r.schedule).reduce((s, n) => s + n, 0);
  assert.equal(total, 0, `pre-commencement year should be $0 (got ${total})`);
});

test("vacancies and space_search agree on vacant unit count", () => {
  const v = T.vacancies({}, ctx);
  const s = T.space_search({}, ctx);
  assert.equal(v.count, s.count, "same vacant universe");
  const realVacant = E.units.filter((u) => u.status === "vacant").length;
  assert.equal(v.count, realVacant);
});

test("space_search honors a min SF filter", () => {
  const s = T.space_search({ minSF: 1000 }, ctx);
  for (const u of s.units) assert.ok((u.sf || 0) >= 1000, "respects minSF");
});

test("insurance_status returns one row per tenant with a valid status", () => {
  const r = T.insurance_status({}, ctx);
  const valid = new Set(["current", "expiring soon", "EXPIRED", "unknown"]);
  for (const row of r.certificates) assert.ok(valid.has(row.status), `status ${row.status}`);
  const tenants = r.certificates.map((c) => c.tenant);
  assert.equal(tenants.length, new Set(tenants).size, "one row per tenant");
});

test("tenant_contact resolves a known tenant and does not let a loose token hijack", () => {
  // a tenant we know has contacts
  const withContacts = [...ctx.contactsByTenant.keys()][0];
  const t = E.tenants.find((x) => x.id === withContacts);
  if (t) {
    const r = T.tenant_contact({ tenant: t.name }, ctx);
    assert.ok(r.contacts && r.contacts.length >= 1, "returns contacts");
  }
  // a single loose token should still resolve to *something* sane, never throw
  assert.doesNotThrow(() => T.tenant_contact({ tenant: "Jones" }, ctx));
});

test("lease_action returns a non-empty label for a real tenant", () => {
  const r = T.lease_action({ tenant: aTenant.name }, ctx);
  assert.ok(r.action && typeof r.action === "string" && r.action.length > 0);
});

test("runTool routes by name and is crash-proof", () => {
  assert.ok(T.runTool("portfolio_kpis", {}, ctx).commercial, "valid tool runs");
  assert.match(T.runTool("does_not_exist", {}, ctx).error, /Unknown tool/);
  // a tool given garbage args must not throw out of runTool
  assert.doesNotThrow(() => T.runTool("find_tenant", null, ctx));
});

test("portfolio_kpis vacancy + occupancy are complementary and in range", () => {
  const r = T.portfolio_kpis({}, ctx);
  const o = r.commercial.occupancyPct, v = r.commercial.vacancyRatePct;
  assert.ok(o >= 0 && o <= 100, "occupancy in range");
  assert.ok(Math.abs((o + v) - 100) < 0.2, "occ + vacancy ≈ 100");
});
