// Firebase web app configuration (PUBLIC — safe to commit).
//
// These values are client identifiers, NOT secrets. Security is enforced by
// Firebase Auth + Firestore security rules (see firestore.rules), not by hiding
// this config. See: https://firebase.google.com/docs/projects/api-keys
//
// ─── SETUP ───────────────────────────────────────────────────────────────────
// Live config for the `crosby-agents` Firebase project (wired 2026-06-11).
//   Firebase Console → Project settings → Your apps → Web app → SDK setup → Config
//
// With real values present, the dashboard runs in FIRESTORE MODE: Google sign-in
// is required and data is read from Firestore. Firestore must be seeded first
// (`npm run seed`) or the dashboard will sign in to an empty database.
// See crosby-data.js and SETUP_CHECKLIST.md.

export const firebaseConfig = {
  apiKey:            "AIzaSyDN4ZzPSSIeAI6WleQyDbT4GRtnI7keFbg",
  authDomain:        "crosby-agents.firebaseapp.com",
  projectId:         "crosby-agents",
  storageBucket:     "crosby-agents.firebasestorage.app",
  messagingSenderId: "1023535283942",
  appId:             "1:1023535283942:web:aa9156100ea026e1ea4527",
  measurementId:     "G-N0RZ6XM2G9",
};

// The single operator email allowed to read/write. Must match firestore.rules.
export const OPERATOR_EMAIL = "thomas.ryan.crosby@gmail.com";

// ─── ⚠ TEMPORARY: AUTH DISABLED FOR PUBLIC PREVIEW ───────────────────────────
// When false, the dashboard skips the Google sign-in gate and reads Firestore
// WITHOUT authentication. This requires firestore.rules to allow public reads
// (currently `allow read: if true`), which exposes ALL tenant PII publicly.
// To re-secure: set this to true AND restore the auth-gated read in
// firestore.rules (`allow read: if isOperator()`), then redeploy the rules.
export const AUTH_ENABLED = false;

// True when the config above is still placeholder → dashboard uses local JSON.
export const IS_PLACEHOLDER_CONFIG =
  firebaseConfig.projectId === "REPLACE_WITH_PROJECT_ID";
