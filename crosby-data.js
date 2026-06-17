// crosby-data.js — data transport + auth for the dashboard.
//
// Two modes, chosen automatically from firebase-config.js:
//   • "firestore" — real Firebase config present. Live reads/writes + Google auth.
//   • "local"     — placeholder config. Falls back to fetching data/*.json and
//                   data/dashboard-state.json (served over a local HTTP server).
//                   No auth, approvals not persisted. For previewing only.
//
// The dashboard imports this from its <script type="module"> and never touches
// the Firebase SDK directly. Shape-building (PROPERTIES/LEASE_TERMS/etc.) lives
// in the dashboard, which owns the render contracts; this file is transport only.

import { firebaseConfig, OPERATOR_EMAIL, IS_PLACEHOLDER_CONFIG, AUTH_ENABLED } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.0";
const ENTITY_COLLECTIONS = ["properties", "buildings", "units", "tenants", "leases", "hoaLots", "leaseDocs", "cois", "contacts", "accessInstructions"];
const ENTITY_LOCAL_FILE = { properties: "properties", buildings: "buildings", units: "units",
  tenants: "tenants", leases: "leases", hoaLots: "hoa-lots", leaseDocs: "lease-docs", cois: "cois", contacts: "contacts" };

export const DATA_MODE = IS_PLACEHOLDER_CONFIG ? "local" : "firestore";

let _fb = null; // memoized { app, db, auth, fns... }

async function ensureFirebase() {
  if (_fb) return _fb;
  const [appMod, fsMod, authMod, stMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-storage.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  _fb = {
    db: fsMod.getFirestore(app),
    auth: authMod.getAuth(app),
    storage: stMod.getStorage(app),
    collection: fsMod.collection, getDocs: fsMod.getDocs, onSnapshot: fsMod.onSnapshot,
    doc: fsMod.doc, updateDoc: fsMod.updateDoc, setDoc: fsMod.setDoc, deleteDoc: fsMod.deleteDoc,
    query: fsMod.query, where: fsMod.where, writeBatch: fsMod.writeBatch,
    serverTimestamp: fsMod.serverTimestamp,
    sRef: stMod.ref, uploadBytes: stMod.uploadBytes, getDownloadURL: stMod.getDownloadURL, deleteObject: stMod.deleteObject,
    GoogleAuthProvider: authMod.GoogleAuthProvider, signInWithPopup: authMod.signInWithPopup,
    onAuthStateChanged: authMod.onAuthStateChanged, signOut: authMod.signOut,
  };
  return _fb;
}

const fetchJson = (url) => fetch(`${url}?_t=${Date.now()}`).then((r) => r.json()).catch(() => null);

// ── Auth ──────────────────────────────────────────────────────────────────────
// onUser(user|null): user is the signed-in operator, or null if signed out / not
// allowlisted. In local mode, immediately yields a synthetic local operator so the
// dashboard renders without a sign-in gate.
export async function startAuth(onUser) {
  if (DATA_MODE === "local") { onUser({ email: "local-preview", local: true }); return; }
  // Auth disabled → boot immediately with a synthetic user; data still comes
  // from Firestore (DATA_MODE stays "firestore"). Requires public-read rules.
  if (!AUTH_ENABLED) { onUser({ email: "preview-no-auth", noAuth: true }); return; }
  const fb = await ensureFirebase();
  fb.onAuthStateChanged(fb.auth, (user) => {
    const ok = user && user.emailVerified && user.email === OPERATOR_EMAIL;
    onUser(ok ? user : null);
  });
}

export async function signIn() {
  const fb = await ensureFirebase();
  await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
}

export async function signOutUser() {
  if (DATA_MODE === "local") return;
  const fb = await ensureFirebase();
  await fb.signOut(fb.auth);
}

// ── Entity data (one-shot; portfolio facts change rarely) ─────────────────────
// Returns { properties, buildings, units, tenants, leases, hoaLots } as arrays.
export async function loadEntities() {
  if (DATA_MODE === "local") {
    const out = {};
    await Promise.all(ENTITY_COLLECTIONS.map(async (c) => {
      out[c] = (await fetchJson(`data/${ENTITY_LOCAL_FILE[c]}.json`)) || [];
    }));
    return out;
  }
  const fb = await ensureFirebase();
  const out = {};
  await Promise.all(ENTITY_COLLECTIONS.map(async (c) => {
    const snap = await fb.getDocs(fb.collection(fb.db, c));
    out[c] = snap.docs.map((d) => d.data());
  }));
  return out;
}

// ── Assistant interaction log (WhatsApp Q&A audit trail) ──────────────────────
// Returns recent entries newest-first: { ts, fromNumber, question, answer, model, status, ms }.
export async function loadAssistantLog(max = 300) {
  if (DATA_MODE === "local") return [];
  const fb = await ensureFirebase();
  const snap = await fb.getDocs(fb.collection(fb.db, "assistantLog"));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")))
    .slice(0, max);
}

// ── Live state (documents / activity / agentStatuses / scheduled) ─────────────
// handlers: { onDocuments(arr), onActivity(arr), onAgentStatuses(map), onScheduled(arr) }
// Returns an unsubscribe function. In local mode it's a one-shot read.
export async function subscribeState(handlers) {
  if (DATA_MODE === "local") {
    const state = (await fetchJson("data/dashboard-state.json")) || {};
    handlers.onAgentStatuses?.(state.agentStatuses || {});
    handlers.onScheduled?.(state.scheduled || []);
    handlers.onDocuments?.(state.documents || []);
    handlers.onActivity?.(state.activity || []);
    return () => {};
  }
  const fb = await ensureFirebase();
  const unsubs = [];
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, "documents"),
    (s) => handlers.onDocuments?.(s.docs.map((d) => d.data()))));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, "activity"),
    (s) => handlers.onActivity?.(s.docs.map((d) => d.data()))));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, "scheduled"),
    (s) => handlers.onScheduled?.(s.docs.map((d) => d.data()))));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, "agentStatuses"), (s) => {
    const map = {};
    s.docs.forEach((d) => { map[d.id] = d.data(); });
    handlers.onAgentStatuses?.(map);
  }));
  return () => unsubs.forEach((u) => u());
}

// ── Write-back: persist a document approval/rejection/revision ────────────────
export async function setDocumentStatus(id, status, reviewerEmail) {
  if (DATA_MODE === "local") {
    console.warn(`[local mode] approval not persisted: ${id} → ${status}`);
    return false;
  }
  const fb = await ensureFirebase();
  await fb.updateDoc(fb.doc(fb.db, "documents", id), {
    status,
    reviewedBy: reviewerEmail || null,
    reviewedAt: fb.serverTimestamp(),
  });
  return true;
}

// ── Marketing / Leasing (SHARED, multi-user state) ────────────────────────────
// Promoted suites live in the `marketing` collection (one small doc per suite);
// their flyer photos/floor plan live in `marketingMedia` (one doc per image, to
// stay under Firestore's ~1 MB/doc limit). Both are public read+write so the
// unauthenticated dashboard can keep them in sync across every user and device.
const MKT = "marketing";
const MKT_MEDIA = "marketingMedia";
const mktDocId = (key) => encodeURIComponent(key);

// Live two-collection subscription. handlers: { onReady(bool), onSuites(arr),
// onMedia(arr), onError(e) }. Returns an unsubscribe function.
export async function subscribeMarketing(handlers) {
  if (DATA_MODE === "local") { handlers.onReady?.(false); return () => {}; }
  const fb = await ensureFirebase();
  const unsubs = [];
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, MKT),
    (s) => handlers.onSuites?.(s.docs.map((d) => d.data())),
    (e) => handlers.onError?.(e)));
  unsubs.push(fb.onSnapshot(fb.collection(fb.db, MKT_MEDIA),
    (s) => handlers.onMedia?.(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => handlers.onError?.(e)));
  handlers.onReady?.(true);
  return () => unsubs.forEach((u) => u());
}

// Create/merge a promoted-suite doc. `suite` must include a stable `key`.
export async function upsertMarketingSuite(suite) {
  const fb = await ensureFirebase();
  await fb.setDoc(fb.doc(fb.db, MKT, mktDocId(suite.key)),
    { ...suite, updatedAt: fb.serverTimestamp() }, { merge: true });
}

// Remove a suite and all of its media (batched).
export async function deleteMarketingSuite(key) {
  const fb = await ensureFirebase();
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, MKT_MEDIA), fb.where("key", "==", key)));
  const batch = fb.writeBatch(fb.db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(fb.doc(fb.db, MKT, mktDocId(key)));
  await batch.commit();
}

// Upsert one media item: { id, key, kind:'photo'|'floorplan', order, url }.
export async function putMarketingMedia(media) {
  const fb = await ensureFirebase();
  await fb.setDoc(fb.doc(fb.db, MKT_MEDIA, media.id),
    { ...media, updatedAt: fb.serverTimestamp() });
}

export async function deleteMarketingMedia(id) {
  const fb = await ensureFirebase();
  await fb.deleteDoc(fb.doc(fb.db, MKT_MEDIA, id));
}

// Persist a new photo order: [{ id, order }, …].
export async function reorderMarketingMedia(updates) {
  const fb = await ensureFirebase();
  const batch = fb.writeBatch(fb.db);
  updates.forEach((u) => batch.update(fb.doc(fb.db, MKT_MEDIA, u.id), { order: u.order }));
  await batch.commit();
}

// ── Proposed suites (hypothetical configurations) ─────────────────────────────
// Shared, live, multi-user — same model as marketing. A proposed suite is a
// combination/subdivision of real suites floated for a prospective tenant.
const PROPOSED = "proposedSuites";

export async function subscribeProposed(handlers) {
  if (DATA_MODE === "local") { handlers.onReady?.(false); return () => {}; }
  const fb = await ensureFirebase();
  const unsub = fb.onSnapshot(fb.collection(fb.db, PROPOSED),
    (s) => handlers.onItems?.(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => handlers.onError?.(e));
  handlers.onReady?.(true);
  return unsub;
}

export async function upsertProposedSuite(item) {
  const fb = await ensureFirebase();
  await fb.setDoc(fb.doc(fb.db, PROPOSED, item.id), { ...item, updatedAt: fb.serverTimestamp() }, { merge: true });
}

export async function deleteProposedSuite(id) {
  const fb = await ensureFirebase();
  await fb.deleteDoc(fb.doc(fb.db, PROPOSED, id));
}

// ── Lease Timeline tracker prefs (de-prioritized / "set aside" suites) ─────────
// Shared, live, multi-user — same model as marketing/proposed. One doc per
// set-aside suite, keyed by the suite's tracker key (slug|building|suite). The
// key is URI-encoded for the doc id (Firestore ids can't contain "/") and the
// raw key is also stored in a field, so subscribers get the original key back.
const TRACKER = "trackerPrefs";

export async function subscribeTrackerPrefs(handlers) {
  if (DATA_MODE === "local") { handlers.onReady?.(false); return () => {}; }
  const fb = await ensureFirebase();
  const unsub = fb.onSnapshot(fb.collection(fb.db, TRACKER),
    (s) => handlers.onItems?.(s.docs.map((d) => (d.data() && d.data().key) || decodeURIComponent(d.id))),
    (e) => handlers.onError?.(e));
  handlers.onReady?.(true);
  return unsub;
}

export async function deprioritizeSuite(key) {
  const fb = await ensureFirebase();
  await fb.setDoc(fb.doc(fb.db, TRACKER, encodeURIComponent(key)),
    { key, deprioritized: true, updatedAt: fb.serverTimestamp() }, { merge: true });
}

export async function reprioritizeSuite(key) {
  const fb = await ensureFirebase();
  await fb.deleteDoc(fb.doc(fb.db, TRACKER, encodeURIComponent(key)));
}

// ── Marketing files in Storage (approved flyers — too large for a Firestore doc) ──
// Uploads to marketing/flyers/<encodedKey>.<ext> and returns a download URL +
// storage path (kept on the suite doc). Public read+write is scoped to marketing/
// in storage.rules.
export async function uploadMarketingFlyer(key, file) {
  const fb = await ensureFirebase();
  const ext = (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")) ? "pdf"
            : ((file.name || "").match(/\.([a-z0-9]+)$/i) || [, "bin"])[1].toLowerCase();
  const path = `marketing/flyers/${encodeURIComponent(key)}.${ext}`;
  const ref = fb.sRef(fb.storage, path);
  await fb.uploadBytes(ref, file, { contentType: file.type || "application/octet-stream" });
  const url = await fb.getDownloadURL(ref);
  return { url, path, name: file.name || `flyer.${ext}` };
}

export async function deleteMarketingFile(path) {
  if (!path) return;
  const fb = await ensureFirebase();
  try { await fb.deleteObject(fb.sRef(fb.storage, path)); }
  catch (e) { if (!/object-not-found/.test(String(e && e.code || e))) throw e; }
}
