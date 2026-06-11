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
