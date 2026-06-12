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
