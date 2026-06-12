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
const ENTITY_COLLECTIONS = ["properties", "buildings", "units", "tenants", "leases", "hoaLots"];
const ENTITY_LOCAL_FILE = { properties: "properties", buildings: "buildings", units: "units",
  tenants: "tenants", leases: "leases", hoaLots: "hoa-lots" };

export const DATA_MODE = IS_PLACEHOLDER_CONFIG ? "local" : "firestore";

let _fb = null; // memoized { app, db, auth, fns... }

async function ensureFirebase() {
  if (_fb) return _fb;
  const [appMod, fsMod, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  _fb = {
    db: fsMod.getFirestore(app),
    auth: authMod.getAuth(app),
    collection: fsMod.collection, getDocs: fsMod.getDocs, onSnapshot: fsMod.onSnapshot,
    doc: fsMod.doc, updateDoc: fsMod.updateDoc, serverTimestamp: fsMod.serverTimestamp,
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
