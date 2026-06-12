# Data Changelog

All changes to the `data/` JSON files are logged here by the Clerical Data Agent.
Format: `[YYYY-MM-DD] [file] [action] — [description] — [source file]`

---

## 2026-04-02

### Initial data load — Clerical Data Agent v1

| File | Records | Action | Source |
|------|---------|--------|--------|
| properties.json | 8 | Created | Owner-provided property descriptions + WDB/CSV analysis |
| buildings.json | 5 | Created | rentinfo#1.xls (Bldg 1 full); Bldgs 2–5 stubs pending source files |
| units.json | 13 | Created | rentinfo#1.xls — Building #1 all suites |
| tenants.json | 13 | Created | rentinfo#1.xls cross-referenced with lease PDFs |
| leases.json | 13 | Created | rentinfo#1.xls + lease PDF filenames from Leases_Claude folder |
| hoa-lots.json | 1 | Created | Lakeside Village CSV (summary record; per-lot expansion pending) |

**Notes:**
- Buildings #2–5 are stub records. Run Clerical Data Agent with rentinfo#2–5.xls to populate.
- Metairie Plaza and Metairie Lake residential units not yet represented in units.json. Run Clerical Data Agent with WDB files.
- Lakeside Village lots present as summary only. Full per-lot expansion requires re-running Clerical Data Agent with the controller CSV.
- `daysToNoticeDeadline` values in leases.json are calculated as of 2026-04-01. Must be recalculated on each agent run (not stored statically in production).

---

*All future updates appended below this line by the Clerical Data Agent.*

---

## 2026-06-11

### Reconciliation audit — actual record counts

A drift audit found the data files had grown beyond the 2026-04-02 initial load
without intervening CHANGELOG entries (notably the Mandeville Lake import). No data
values were changed in this audit — counts recorded for documentation accuracy:

| File | Records | Composition |
|------|---------|-------------|
| properties.json | 8 | unchanged |
| buildings.json | 17 | Sanctuary Office Park #1–5 (5) + Mandeville Lake 1–12 (12) |
| units.json | 306 | Sanctuary Bldg #1 (13) + Mandeville Lake (293) |
| tenants.json | 297 | Sanctuary Bldg #1 (13) + Mandeville Lake (284) |
| leases.json | 297 | Sanctuary Bldg #1 (13) + Mandeville Lake (284) |
| hoa-lots.json | 1 | summary stub — Lakeside Village 45-lot expansion still pending |

**Sanctuary Building #1 verified:** 13 leases — 10 active, 1 vacating (Security
National, Suite 302, terminates 2026-06-30), 1 month-to-month (Fine Southern, 100),
1 owner-occupant (Crosby Development, 101). Notice deadlines confirmed: Bayou CPR
(301-A) and Nirvana (306) both 2026-07-04.

**Known gaps (pending source files):**
- Sanctuary Office Park Buildings #2–5 — stub building records only; units/tenants/
  leases not yet loaded. Requires `rentinfo#2–5.xls` (Clerical Data Agent run).
- Lakeside Village — 45-lot per-lot expansion pending controller CSV.
- Metairie Plaza & Metairie Lake — shown on the dashboard from hardcoded values;
  not yet represented in `data/*.json`.

---

## 2026-06-11 (later same day)

### Sanctuary Office Park Buildings #2–5 — roster-level load

Buildings #2–5 were promoted from stub records to active by lifting the campus
roster out of the dashboard's hardcoded `TENANT_ROSTER` (index.html). **This is a
roster-level load, not a source-file reconciliation:** tenant name, suite, SF, and
monthly rent are populated; lease *terms* (commencement/termination/notice/escalation)
are **null** and still require `rentinfo#2–5.xls`.

| File | Action | Detail | Source |
|------|--------|--------|--------|
| buildings.json | Updated | SOP #2–5 stubs → active (totalSF/occupiedSF/vacantSF/floors) | dashboard TENANT_ROSTER |
| units.json | +27 (306→333) | SOP #2–5 suites; Bldg #4 Suite 306 (JCM II) flagged vacant | dashboard TENANT_ROSTER |
| tenants.json | +26 (297→323) | SOP #2–5 commercial tenants (contacts pending) | dashboard TENANT_ROSTER |
| leases.json | +26 (297→323) | SOP #2–5 leases — rent only, term dates null | dashboard TENANT_ROSTER |
| properties.json | Updated | SOP totalSF 91352 → 98217 (sum of building totals) | derived |

**Notes:**
- Campus now computes from data: 5 buildings, 40 units (1 vacant), 39 leases / tenants,
  98,217 SF, 99.5% occupancy, $173,835.43/mo. These supersede the stale hardcoded
  dashboard figures (91,602 SF / 99.7% / $173,452.80), which understated Building #1
  (used 10,228 SF vs the reconciled 16,843 SF).
- **Provenance caveat:** the #2–5 SF/rent values share the same hardcoded origin as the
  (incorrect) Building #1 rollup figure, so they are best-available, not source-verified.
  Reconcile against `rentinfo#2–5.xls` when available; that pass also fills the null lease
  terms and enables the weekly notice-deadline scan for #2–5.
- Building #1 (13 leases, reconciled from rentinfo#1.xls) was not touched.
- Tenant `Detox` recurs in Buildings #1 and #4; the #4 record is id `tenant-detox-4` to
  avoid an id collision (may be the same legal entity — confirm at reconciliation).
- Pre-existing data issue (out of scope, flag for follow-up): 8 duplicate unit ids in the
  Mandeville Lake import (`ml-b03-34`, `ml-b06-20`, `ml-b06-24`, `ml-b07-30`, `ml-b08-112`,
  `ml-b08-306`, `ml-b11-12`, `ml-b11-25`).
- Re-seed Firestore (`npm run seed`) once operator credentials are configured.

---

## 2026-06-11 (later same day)

### Backfill remaining hardcoded property data → Firestore (de-hardcode the dashboard)

To make the dashboard derive 100% from Firestore (no hardcoded arrays), the property
data that previously lived only in `index.html` was lifted into `data/*.json`:

| File | Action | Detail | Source |
|------|--------|--------|--------|
| properties.json | Updated (8) | Added `profile` (description/website/address/year), `cls`, `location`, `isCommercial`, `isHOA`, `unitMix` | dashboard PROPERTY_PROFILES + PROPERTIES |
| units.json | +170 (333→503) | Metairie Plaza (62) + Metairie Lake (108) residential units | dashboard UNIT_ROSTER |
| tenants.json | +162 (323→485) | Metairie residents (named/occupied units) | dashboard UNIT_ROSTER |
| leases.json | +162 (323→485) | Metairie unit↔tenant links (rent/terms null — roster-level) | dashboard UNIT_ROSTER |
| hoa-lots.json | 1 → 45 | Lakeside Village full 45-lot roster (replaced summary stub) | dashboard UNIT_ROSTER |

**Notes:**
- The dashboard now renders via `crosby-viewmodel.js`, which derives PROPERTIES /
  PROPERTY_PROFILES / UNIT_ROSTER / TENANT_ROSTER / LEASE_TERMS / LEASE_DOCS from these
  entities. All hardcoded data arrays were removed from `index.html`.
- SOP campus SF now derives to 96,217 (sum of suite SF) vs the 98,217 stored on the
  building records — Building #1's suites sum to 14,843 SF but its record shows 16,843
  (~2,000 SF common area not assigned to a suite). The dashboard uses suite sums.
- Mandeville Lake shows 285 units (not 293): the 8 duplicate-id rows are the SAME unit
  entered twice with conflicting occupied/vacant status. 285 unique units is likely the
  correct count; confirm against `2026 ML RR.xlsx`.
- Metairie Plaza shows 62 units (roster had 62 entries; the old hardcoded "66" was a
  rollup figure). Metairie lease rent/terms are null pending the source rent rolls.
- Re-seeded Firestore; removed the orphan `lakeside-lot-summary` doc.

---

## 2026-06-11 (later same day)

### Lease PDF library — migrated from `proppli` bucket, linked to tenants

Copied 38 lease PDFs from `gs://proppli.firebasestorage.app/leases` into a new public
bucket `gs://crosby-agents-leases` (object path `leases/<file>`), and added
`data/lease-docs.json` (new `leaseDocs` Firestore collection) mapping each file to its
tenant/building/suite + public URL.

| File | Records | Detail |
|------|---------|--------|
| lease-docs.json | 35 | SOP lease docs linked to 19 tenants (Security National ×7, Nirvana ×4, Acorn/Bayou CPR/Watch Systems ×3, …) across Buildings #1/#2/#4/#5 |

**Notes:**
- The dashboard's commercial property detail now renders working PDF links (open in a new
  tab) from `leaseDocs.url`; `crosby-viewmodel.js` derives `LEASE_DOCS` from this collection
  (replacing the dead `computer:///…/Leases_Claude/…` paths and the per-lease `docFile` field).
- **⚠ Public exposure (operator-approved):** the bucket grants `allUsers` object-read, so the
  PDFs are world-downloadable to match the current no-auth public dashboard. Re-secure
  (remove the allUsers binding + re-enable auth) before treating this as anything but a preview.
- **3 files uploaded but NOT linked** (no matching tenant in the data): `The Maven Group_Lease.pdf`,
  `CONN_BLDG1_AMD1.pdf` (×2). They sit in the bucket; link them once the tenants are identified.
- Filename suite hint vs. data: `BLDG2_FLR3_302C_BodyRemedy.pdf` was linked to tenant Body
  Remedy (Building #1, Suite 303A per the dashboard data); the filename's B2/302C may be a
  proppli mislabel — confirm.

### Lease PDFs moved to the real Firebase bucket + locked down

Once the operator enabled Firebase Storage, the 38 PDFs were moved from the temporary
public bucket into the project's Firebase bucket `gs://crosby-agents.firebasestorage.app`
(path `leases/`), and the temporary `crosby-agents-leases` bucket was **deleted**.

**Access model (improved):** each linked PDF now carries a Firebase **download token**;
`lease-docs.json` URLs were rewritten to the tokenized
`firebasestorage.googleapis.com/.../o/leases%2F<file>?alt=media&token=<uuid>` form.
`storage.rules` (new, deployed) denies all rule-based read/write — download-token URLs
bypass rules, so the dashboard links work while the bucket is **not** publicly readable or
listable (verified: tokenized URL → 200, no-token → 403). This replaced the console's
temporary test-mode rules (which allowed public writes and would have expired). The
earlier whole-bucket `allUsers` public-read exposure is gone.

---

## 2026-06-11 (later same day)

### Building #1 lease reconciliation (operator-provided table)

Reconciled the 12 leased Building #1 suites against an operator-provided table (matched
by suite; Suite 101 owner-occupant not in the table). Rent, SQFT and escalation % all
**confirmed** the existing records (no change). Applied changes:

- **Suite 100: Fine Southern Properties (month-to-month) → Christine West**, now a
  fixed-term lease (exp 2027-01-31, no escalation, no auto-renew). Updated the tenant
  record (id `tenant-fine-southern` retained) and the Suite 100 lease-doc label.
- **New field `escalationMonth`** added to all 12 leases (month the escalation occurs);
  surfaced in the lease-timeline escalation column, e.g. "3.0% (Apr)".
- **Auto-renew:** Security National `Yes→No`, Brandner `Yes→No`, Detox `Yes→Unknown`
  (stored `null`; dashboard now shows "? Unknown").
- **Expiration months** updated to the table's stated month — set to the **last day of
  that month** (kept the current day where the month already matched). Notice deadlines
  and `daysToNoticeDeadline` recomputed from the new terminations (as of 2026-06-11).
- **Security National (Suite 302)** vacate date moved 2026-06-30 → **2026-07-31**; updated
  the stale "vacant July 1" note. ⚠ This post-dates the existing Suite 302 vacancy-marketing
  outputs — regenerate if the exact date matters.

**Assumption to confirm:** the table's expiration *month* sits one month after several of
the current end-of-month dates (e.g. Bayou `2026-12-31` → table `01 2027`). Treated the
table as authoritative and used last-day-of-stated-month; correct any specific days if the
two were meant to describe the same expiry.
