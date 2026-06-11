// Shared firebase-admin initialization for seed/sync scripts.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH = join(__dirname, "..", "serviceAccountKey.json");

export function getDb() {
  if (existsSync(KEY_PATH)) {
    initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, "utf-8"))) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({ credential: applicationDefault() });
  } else {
    console.error(
      "✗ No credentials. Put a service-account key at scripts/serviceAccountKey.json\n" +
      "  or set GOOGLE_APPLICATION_CREDENTIALS. See SETUP_CHECKLIST.md."
    );
    process.exit(1);
  }
  return getFirestore();
}
