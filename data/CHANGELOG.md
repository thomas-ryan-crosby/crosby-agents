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
