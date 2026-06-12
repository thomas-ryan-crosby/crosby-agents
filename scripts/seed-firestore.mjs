// One-time, idempotent Firestore seeder.
//
// Loads data/*.json (entity collections) + data/dashboard-state.json (split into
// the 4 state collections) and inlines each agent output's markdown body into
// documents/{id}.body. All writes are batched and merged by doc id, so re-running
// is safe.
//
// Usage:
//   1. Place your Firebase service-account key at scripts/serviceAccountKey.json
//      (Firebase Console → Project settings → Service accounts → Generate key).
//      It is gitignored — never commit it.
//   2. npm install && npm run seed
//
// Or set GOOGLE_APPLICATION_CREDENTIALS to the key path instead of the file.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "./lib/admin.mjs";
import { scanOutputs, toDocumentEntry, toActivityEntry } from "./lib/parse-outputs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "data");
const OUTPUTS_DIR = join(REPO_ROOT, "knowledge-base", "outputs");

const db = getDb();

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

// ── Batched upsert helper (Firestore caps batches at 500 writes) ──────────────
async function upsert(collection, items, idField = "id") {
  let written = 0;
  for (let i = 0; i < items.length; i += 450) {
    const batch = db.batch();
    for (const item of items.slice(i, i + 450)) {
      const id = String(item[idField]);
      batch.set(db.collection(collection).doc(id), item, { merge: true });
    }
    await batch.commit();
    written += Math.min(450, items.length - i);
  }
  console.log(`  ✓ ${collection.padEnd(16)} ${written} docs`);
  return written;
}

async function main() {
  console.log("┌─ Firestore Seed ─────────────────────────────────────");

  // 1. Entity collections (data/*.json → collection, doc id = item.id)
  const entityFiles = {
    properties: "properties.json",
    buildings:  "buildings.json",
    units:      "units.json",
    tenants:    "tenants.json",
    leases:     "leases.json",
    hoaLots:    "hoa-lots.json",
    leaseDocs:  "lease-docs.json",
    cois:       "cois.json",
  };
  for (const [col, file] of Object.entries(entityFiles)) {
    const path = join(DATA_DIR, file);
    if (!existsSync(path)) { console.log(`  – ${col}: ${file} missing, skipped`); continue; }
    await upsert(col, readJson(path));
  }

  // 2. Dashboard state (split dashboard-state.json into 4 collections + meta doc)
  const state = readJson(join(DATA_DIR, "dashboard-state.json"));

  // 2a. documents — attach inline markdown body from each output file
  const docs = (state.documents || []).map((d) => {
    const out = { ...d };
    if (d.file) {
      const fp = join(REPO_ROOT, d.file);
      if (existsSync(fp)) out.body = readFileSync(fp, "utf-8");
    }
    return out;
  });
  // Merge in any scanned outputs not already present in dashboard-state
  const known = new Set(docs.map((d) => d.id));
  const scanned = scanOutputs(OUTPUTS_DIR, REPO_ROOT);
  for (const meta of scanned) {
    if (!known.has(meta.fileId)) { docs.push(toDocumentEntry(meta)); known.add(meta.fileId); }
  }
  await upsert("documents", docs);

  // 2b. activity
  const acts = [...(state.activity || [])];
  const knownActs = new Set(acts.map((a) => a.id));
  for (const meta of scanned) {
    const a = toActivityEntry(meta);
    if (!knownActs.has(a.id)) { acts.push(a); knownActs.add(a.id); }
  }
  await upsert("activity", acts);

  // 2c. agentStatuses (map → one doc per agent slug)
  const agentStatuses = Object.entries(state.agentStatuses || {}).map(
    ([slug, s]) => ({ id: slug, ...s })
  );
  await upsert("agentStatuses", agentStatuses);

  // 2d. scheduled (array, doc id = taskId)
  await upsert("scheduled", state.scheduled || [], "taskId");

  // 2e. meta/dashboard single doc
  await db.collection("meta").doc("dashboard").set(
    { ...(state._meta || {}), seededAt: new Date().toISOString() },
    { merge: true }
  );
  console.log("  ✓ meta/dashboard");

  console.log("└─ Seed complete ──────────────────────────────────────");
}

main().catch((err) => { console.error(err); process.exit(1); });
