// Shared test helpers: load the local data/*.json the same way the app does, and
// build an assistant `ctx` without touching Firestore (mirrors buildContext()).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deriveViewModel } from "../crosby-viewmodel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "..", "data");

const FILES = {
  properties: "properties.json", buildings: "buildings.json", units: "units.json",
  tenants: "tenants.json", leases: "leases.json", hoaLots: "hoa-lots.json",
  leaseDocs: "lease-docs.json", cois: "cois.json", contacts: "contacts.json",
};

export function loadLocalEntities() {
  const out = {};
  for (const [key, file] of Object.entries(FILES)) {
    out[key] = JSON.parse(readFileSync(join(DATA_DIR, file), "utf-8"));
  }
  return out;
}

// Mirror lib/assistant-tools.mjs buildContext(), but from local JSON + a fixed
// "today" so tests are deterministic.
export function buildLocalCtx(E, today = new Date("2026-06-13T12:00:00Z")) {
  const vm = deriveViewModel(E);
  const contactsByTenant = new Map();
  for (const c of E.contacts || []) {
    if (!c.tenantId) continue;
    if (!contactsByTenant.has(c.tenantId)) contactsByTenant.set(c.tenantId, []);
    contactsByTenant.get(c.tenantId).push(c);
  }
  return {
    E, vm,
    unitById: new Map((E.units || []).map((u) => [u.id, u])),
    tenantById: new Map((E.tenants || []).map((t) => [t.id, t])),
    bldgById: new Map((E.buildings || []).map((b) => [b.id, b])),
    propById: new Map((E.properties || []).map((p) => [p.id, p])),
    contactsByTenant,
    today,
  };
}
