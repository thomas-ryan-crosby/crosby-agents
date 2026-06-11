// Ongoing Firestore sync — the Firestore-era replacement for sync-dashboard.py.
//
// Scans knowledge-base/outputs/*/*.md, upserts each into the `documents` (with
// inline markdown body) and `activity` collections, and patches each agent's
// `agentStatuses` doc (lastRun/lastOutput/status) from its most recent output.
// Agents run this after each output instead of editing dashboard.html.
//
// Unlike the old Python script, this does NOT regenerate dashboard-state.json or
// string-patch the dashboard — Firestore is the source of truth and the dashboard
// reads it live.
//
// Usage:  npm run sync   (needs scripts/serviceAccountKey.json — see SETUP_CHECKLIST.md)

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getDb } from "./lib/admin.mjs";
import { scanOutputs, toDocumentEntry, toActivityEntry } from "./lib/parse-outputs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUTPUTS_DIR = join(REPO_ROOT, "knowledge-base", "outputs");

const db = getDb();

async function main() {
  console.log("┌─ Firestore Sync ─────────────────────────────────────");
  const scanned = scanOutputs(OUTPUTS_DIR, REPO_ROOT);
  console.log(`│  Output files found: ${scanned.length}`);

  // Track latest output per agent for the agentStatuses patch
  const latestByAgent = {};
  const docBatch = db.batch();
  const actBatch = db.batch();

  for (const meta of scanned) {
    const docEntry = toDocumentEntry(meta);
    const actEntry = toActivityEntry(meta);
    // merge:true so a human approval already in Firestore isn't clobbered back to
    // pending — status only advances when the file header itself changed.
    docBatch.set(db.collection("documents").doc(docEntry.id), docEntry, { merge: true });
    actBatch.set(db.collection("activity").doc(actEntry.id), actEntry, { merge: true });

    if (meta.agentSlug) {
      const prev = latestByAgent[meta.agentSlug];
      if (!prev || meta.mtime > prev.mtime) latestByAgent[meta.agentSlug] = meta;
    }
  }
  await docBatch.commit();
  await actBatch.commit();
  console.log(`│  Upserted ${scanned.length} documents + activity entries`);

  const statusBatch = db.batch();
  for (const [slug, meta] of Object.entries(latestByAgent)) {
    statusBatch.set(
      db.collection("agentStatuses").doc(slug),
      { id: slug, status: "active", lastRun: meta.mtime.toISOString().replace(/\.\d+Z$/, "Z"), lastOutput: meta.fileId },
      { merge: true }
    );
    console.log(`│  ${slug} → lastOutput ${meta.fileId}`);
  }
  await statusBatch.commit();

  await db.collection("meta").doc("dashboard").set(
    { lastUpdated: new Date().toISOString().replace(/\.\d+Z$/, "Z"), updatedBy: "sync-firestore" },
    { merge: true }
  );
  console.log("└─ Sync complete ──────────────────────────────────────");
}

main().catch((err) => { console.error(err); process.exit(1); });
