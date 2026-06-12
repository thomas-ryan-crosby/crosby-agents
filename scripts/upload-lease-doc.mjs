// Upload a lease PDF + HTML to Firebase Storage with public download tokens.
// Usage: node scripts/upload-lease-doc.mjs <local.pdf> <local.html> <basename>
//   -> prints the tokenized url + htmlUrl for data/lease-docs.json
// Auth: Application Default Credentials (gcloud ADC) + GOOGLE_CLOUD_PROJECT=crosby-agents.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const BUCKET = "crosby-agents.firebasestorage.app";
const [pdfPath, htmlPath, base] = process.argv.slice(2);
if (!pdfPath || !htmlPath || !base) {
  console.error("Usage: node scripts/upload-lease-doc.mjs <pdf> <html> <basename>");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), storageBucket: BUCKET });
const bucket = getStorage().bucket();

async function put(localPath, destPath, contentType) {
  const token = randomUUID();
  await bucket.upload(localPath, {
    destination: destPath,
    metadata: { contentType, metadata: { firebaseStorageDownloadTokens: token } },
  });
  const enc = encodeURIComponent(destPath);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${enc}?alt=media&token=${token}`;
}

const url = await put(pdfPath, `leases/${base}.pdf`, "application/pdf");
const htmlUrl = await put(htmlPath, `leases-html/${base}.html`, "text/html");
console.log(JSON.stringify({ url, htmlUrl }, null, 2));
