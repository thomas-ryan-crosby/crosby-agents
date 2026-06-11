// Firebase web app configuration (PUBLIC — safe to commit).
//
// These values are client identifiers, NOT secrets. Security is enforced by
// Firebase Auth + Firestore security rules (see firestore.rules), not by hiding
// this config. See: https://firebase.google.com/docs/projects/api-keys
//
// ─── SETUP ───────────────────────────────────────────────────────────────────
// Replace the placeholder values below with your real Firebase web app config:
//   Firebase Console → Project settings → Your apps → Web app → SDK setup → Config
//
// Until real values are filled in, the dashboard runs in LOCAL FALLBACK MODE,
// reading data/*.json directly (no Firestore, no auth). See crosby-data.js.

export const firebaseConfig = {
  apiKey:            "REPLACE_WITH_API_KEY",
  authDomain:        "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId:         "REPLACE_WITH_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId:             "REPLACE_WITH_APP_ID",
};

// The single operator email allowed to read/write. Must match firestore.rules.
export const OPERATOR_EMAIL = "thomas.ryan.crosby@gmail.com";

// True when the config above is still placeholder → dashboard uses local JSON.
export const IS_PLACEHOLDER_CONFIG =
  firebaseConfig.projectId === "REPLACE_WITH_PROJECT_ID";
