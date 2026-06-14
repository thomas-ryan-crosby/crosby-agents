// Viewmodel tests: deriveViewModel() must be deterministic, structurally complete,
// and produce sane occupancy math with no NaN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveViewModel } from "../crosby-viewmodel.js";
import { loadLocalEntities } from "./_helpers.mjs";

const E = loadLocalEntities();
const vm = deriveViewModel(E);

test("returns all documented keys", () => {
  for (const k of ["PROPERTIES", "PROPERTY_PROFILES", "UNIT_ROSTER", "TENANT_ROSTER", "LEASE_TERMS", "LEASE_DOCS", "MOVED_OUT", "TERMINATIONS"]) {
    assert.ok(k in vm, `viewmodel missing ${k}`);
  }
  assert.ok(Array.isArray(vm.PROPERTIES) && vm.PROPERTIES.length > 0, "PROPERTIES non-empty");
});

test("every entity property surfaces in PROPERTIES", () => {
  const slugs = new Set(vm.PROPERTIES.map((p) => p.slug));
  for (const p of E.properties) assert.ok(slugs.has(p.id), `property ${p.id} missing from viewmodel`);
});

test("commercial properties have SF occupancy that is internally consistent", () => {
  for (const p of vm.PROPERTIES) {
    if (p.totalSF == null) continue;
    assert.ok(Number.isFinite(p.totalSF) && p.totalSF >= 0, `${p.slug} totalSF`);
    const occ = p.occupiedSF || 0, vac = p.vacantSF || 0;
    assert.ok(Number.isFinite(occ) && occ >= 0, `${p.slug} occupiedSF`);
    assert.ok(Number.isFinite(vac) && vac >= 0, `${p.slug} vacantSF`);
    assert.ok(occ <= p.totalSF + 1, `${p.slug} occupied (${occ}) > total (${p.totalSF})`);
    // occupied + vacant should be within rounding of total
    assert.ok(Math.abs((occ + vac) - p.totalSF) <= Math.max(2, p.totalSF * 0.001) || vac === 0,
      `${p.slug} occ+vac (${occ + vac}) far from total (${p.totalSF})`);
  }
});

test("no NaN leaks into PROPERTIES numeric fields", () => {
  for (const p of vm.PROPERTIES) {
    for (const f of ["totalSF", "occupiedSF", "vacantSF", "monthlyRent"]) {
      if (p[f] != null) assert.ok(!Number.isNaN(Number(p[f])), `${p.slug}.${f} is NaN`);
    }
  }
});

test("deriveViewModel is deterministic (same input → identical output)", () => {
  const a = JSON.stringify(deriveViewModel(loadLocalEntities()).PROPERTIES);
  const b = JSON.stringify(deriveViewModel(loadLocalEntities()).PROPERTIES);
  assert.equal(a, b);
});

test("handles empty input without throwing", () => {
  const empty = deriveViewModel({ properties: [], buildings: [], units: [], tenants: [], leases: [], leaseDocs: [], cois: [], contacts: [], hoaLots: [] });
  assert.ok(Array.isArray(empty.PROPERTIES));
});

test("tolerates undefined collections", () => {
  assert.doesNotThrow(() => deriveViewModel({}));
});

test("LEASE_DOCS includes Dianne's new lease doc keyed under its property", () => {
  const all = JSON.stringify(vm.LEASE_DOCS);
  assert.match(all, /leasedoc-diannesbldg1ste305binit|Diannes_BLDG1_STE305B_Init/);
});
