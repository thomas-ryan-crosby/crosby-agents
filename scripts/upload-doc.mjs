// Upload a document PDF + HTML to Firebase Storage with public download tokens.
// Usage: node scripts/upload-doc.mjs <local.pdf> <local.html> <basename> [category]
//   category: "lease" (default) -> leases/ + leases-html/
//             "coi"             -> cois/   + cois-html/
//   -> prints the tokenized url + htmlUrl for data/lease-docs.json or data/cois.json
// Auth: Application Default Credentials (gcloud ADC) + GOOGLE_CLOUD_PROJECT=crosby-agents.
import { randomUUID } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const BUCKET = "crosby-agents.firebasestorage.app";
const FOLDERS = {
  lease: { pdf: "leases", html: "leases-html" },
  coi: { pdf: "cois", html: "cois-html" },
};
const [pdfPath, htmlPath, base, category = "lease"] = process.argv.slice(2);
const folder = FOLDERS[category];
if (!pdfPath || !htmlPath || !base || !folder) {
  console.error("Usage: node scripts/upload-doc.mjs <pdf> <html> <basename> [lease|coi]");
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
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}

const url = await put(pdfPath, `${folder.pdf}/${base}.pdf`, "application/pdf");
const htmlUrl = await put(htmlPath, `${folder.html}/${base}.html`, "text/html");
console.log(JSON.stringify({ url, htmlUrl }, null, 2));
