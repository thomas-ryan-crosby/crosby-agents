# Setup Checklist — Firestore + Vercel

This dashboard reads its data from **Firebase Firestore** and deploys as a static
site on **Vercel**. Until you complete steps 1–6, the dashboard runs in **local
fallback mode** (reads `data/*.json` directly when served over a local HTTP server)
— useful for previewing, but approvals don't persist and it isn't deployed.

> **Note:** going live ends the old "double-click `dashboard.html`" workflow. The
> app now needs an HTTP origin (Vercel, or a local server) because it uses ES
> modules + Firebase Auth, which browsers block on `file://`.

---

## 1. Create the Firebase project
- [ ] [Firebase Console](https://console.firebase.google.com) → **Add project** → name it (e.g. `crosby-agents`).
- [ ] **Build → Firestore Database → Create database** → *Production mode* → region `nam5` (US multi-region) or nearest.
- [ ] **Build → Authentication → Get started → Sign-in method → enable Google** only. Set a support email.

## 2. Register the web app + paste config
- [ ] **Project settings (gear) → Your apps → Web (`</>`)** → register an app (no Hosting needed).
- [ ] Copy the `firebaseConfig` values → paste them into **`firebase-config.js`**, replacing the `REPLACE_WITH_*` placeholders.
- [ ] If your operator email differs from `thomas.ryan.crosby@gmail.com`, update it in **both** `firebase-config.js` (`OPERATOR_EMAIL`) **and** `firestore.rules`.

## 3. Download the service-account key (for seeding — keep secret)
- [ ] **Project settings → Service accounts → Generate new private key** → save as **`scripts/serviceAccountKey.json`**.
- [ ] Confirm it is gitignored (it is by default). **Never commit this file.**

## 4. Install deps + seed Firestore
- [ ] `npm install`
- [ ] `npm run seed` → loads `data/*.json` + agent outputs into Firestore. Verify the collection counts it prints, and in the Firebase console.

## 5. Deploy the security rules + indexes
- [ ] Install the Firebase CLI if needed: `npm i -g firebase-tools` → `firebase login`.
- [ ] `firebase use --add` → select your project.
- [ ] `firebase deploy --only firestore:rules,firestore:indexes`

## 6. Deploy to Vercel (Git integration)
- [ ] Push this repo to GitHub (the migration branch, then merge to `main`).
- [ ] [Vercel](https://vercel.com) → **Add New → Project → Import** the GitHub repo.
- [ ] Framework preset: **Other**. Build command: **none**. Output directory: **`.`** (repo root). Deploy.
- [ ] **Firebase Console → Authentication → Settings → Authorized domains → Add** your `*.vercel.app` domain (and any custom domain). `signInWithPopup` fails until you do this — most common first-deploy error.

## 7. Verify
- [ ] Visit the Vercel URL → **Sign in with Google** as the operator → dashboard loads live data.
- [ ] Approve a document → reload → status **persists**. Open a second tab → the change appears live.
- [ ] `npm run sync` after a new agent output → it appears on the dashboard.

---

## Ongoing operation
- Agents write markdown to `knowledge-base/outputs/<agent>/` then run **`npm run sync`** (replaces the old `python scripts/sync-dashboard.py`).
- When new rent-roll data arrives, update `data/*.json` (Clerical Data Agent) then **`npm run seed`** to push it to Firestore.
- `scripts/sync-dashboard.py` is **deprecated** — kept only for reference.

## What's NOT deployed to Vercel
`.vercelignore` ships only `index.html`, `firebase-config.js`, `crosby-data.js`,
and `vercel.json`. All of `data/`, `knowledge-base/`, `scripts/`, etc. stay out of
the public bundle so tenant PII is never served as static files — production reads
that data from Firestore behind the auth gate.
