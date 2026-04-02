# Crosby Development — Data Schema

**Version:** 1.0
**Issued:** April 2, 2026
**Owner:** Clerical Data Agent (maintained), Ryan Crosby (approved)

---

## Overview

All operational data in the Crosby Development agent system lives in the `data/` folder as structured JSON files. **No agent reads raw source files (XLS, WDB, CSV, PDF) directly.** The Clerical Data Agent is the sole interface between raw source files and the clean data store.

This mirrors the data architecture of traditional property management software (Yardi, MRI, AppFolio) — with the difference that the data layer is JSON files managed by an agent rather than a SQL database.

---

## Data Files

```
data/
  properties.json     ← 8 properties, top-level metadata
  buildings.json      ← Buildings within multi-building properties
  units.json          ← Individual suites / apartment units / lots
  tenants.json        ← Tenant / owner records
  leases.json         ← Active and historical lease records
  hoa-lots.json       ← HOA-specific lot data (dues, governance)
  CHANGELOG.md        ← Every update to any data file, timestamped
```

---

## Schema Definitions

### properties.json

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `sanctuary-office-park` |
| name | string | Full property name |
| type | string | `Commercial` / `Multi-Family` / `HOA` / `Industrial` / `Mixed` |
| address | string | Street address |
| city | string | City |
| state | string | State abbreviation |
| zip | string | ZIP code |
| totalSF | number | Total leasable square footage (null for lot-based) |
| totalUnits | number | Total units/lots (null for SF-based) |
| status | string | `active` / `development` / `partial` |
| crosbyRole | string | `Owner-Operator` / `Owner-PM` / `HOA-Manager` / `Partial` |
| dataSource | string | Original source file name for audit trail |
| lastUpdated | string | ISO date of last data update |

### buildings.json

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `sanctuary-bldg-1` |
| propertyId | string | Foreign key → properties.id |
| name | string | e.g. `Building #1` |
| totalSF | number | Total leasable SF in this building |
| floors | number | Number of floors |
| status | string | `active` / `pending-data` |

### units.json

The central record for any leasable space — commercial suite, residential apartment, or industrial lot.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `sanctuary-bldg1-suite300` |
| buildingId | string | Foreign key → buildings.id (null if no building layer) |
| propertyId | string | Foreign key → properties.id |
| identifier | string | Suite number, unit number, or lot number |
| floor | number | Floor number (null if not applicable) |
| sf | number | Square footage |
| type | string | `office` / `apartment` / `townhome` / `cottage` / `industrial-lot` |
| bedrooms | number | Residential only (null for commercial) |
| bathrooms | number | Residential only |
| status | string | `occupied` / `vacant` / `owner-occupied` / `pending-data` |

### tenants.json

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `tenant-bayou-cpr` |
| name | string | Full legal tenant name |
| type | string | `commercial` / `residential` / `hoa-owner` / `owner-occupant` |
| contactName | string | Primary contact (null if unknown) |
| email | string | Contact email (null if unknown) |
| phone | string | Contact phone (null if unknown) |
| notes | string | Any relevant context |

### leases.json

The core operational record. Every active lease relationship lives here.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `lease-bldg1-suite300-msquared` |
| unitId | string | Foreign key → units.id |
| tenantId | string | Foreign key → tenants.id |
| propertyId | string | Denormalized for quick filtering |
| buildingId | string | Denormalized for quick filtering |
| commenced | string | ISO date, e.g. `2026-03-15` |
| terminates | string | ISO date, or `"MTM"` for month-to-month, `"Owner"` for owner-occupant |
| monthlyRent | number | Current monthly rent (null for owner/HOA) |
| escalationPct | number | Annual escalation percentage, e.g. `3.0` |
| autoRenew | boolean | Whether lease auto-renews |
| noticeDays | number | Days notice required to terminate or not renew (null if none) |
| noticeDeadline | string | ISO date of next notice deadline (null if not applicable) |
| status | string | `active` / `vacating` / `mtm` / `owner-occupant` / `expired` |
| docFile | string | Lease PDF filename (null if no file on record) |
| notes | string | Special conditions, amendments, options |

### hoa-lots.json

Extends unit data with HOA-specific fields for Lakeside Village, DeLimon Place, and The Sanctuary.

| Field | Type | Description |
|-------|------|-------------|
| id | string | Slug, e.g. `lakeside-lot-1` |
| unitId | string | Foreign key → units.id |
| propertyId | string | Foreign key → properties.id |
| lotNumber | string | HOA lot number |
| lotType | string | `townhome` / `cottage` / `single-family` / `condo` |
| ownerName | string | Legal owner of record |
| ownerPhone | string | |
| ownerEmail | string | |
| crosbyOwned | boolean | Whether Crosby owns this lot |
| tenantName | string | Renter name (null if owner-occupied) |
| managedBy | string | `Crosby` / `Third-Party` / `Owner-Occupied` |
| monthlyRent | number | If rented (null otherwise) |
| monthlyDues | number | HOA dues for this lot |
| duesStatus | string | `current` / `overdue` / `unknown` |
| notes | string | |

---

## Update Protocol

1. **Clerical Data Agent** receives a new source file (XLS, WDB, CSV)
2. Agent parses the file and maps fields to the schema above
3. Agent generates a diff: what changed vs. the current JSON
4. Diff is posted to `data/CHANGELOG.md` and to the Docs tab as Pending Review
5. Ryan reviews the diff and approves or flags issues
6. On approval, the JSON files are updated
7. All other agents immediately read the updated data on their next run

**No other agent writes to `data/`. They are read-only consumers.**

---

## Relationship Map

```
properties
    └── buildings (1:many)
            └── units (1:many)
                    └── leases (1:active lease per unit)
                    │       └── tenants (many:1)
                    └── hoa-lots (1:1, HOA properties only)
```

---

## Current Data Status

| File | Records | Source | Last Updated | Status |
|------|---------|--------|-------------|--------|
| properties.json | 8 | Owner-provided | 2026-04-02 | ✅ Complete |
| buildings.json | 6 | rentinfo#1–5.xls | 2026-04-02 | ✅ Bldg 1 full; #2–5 partial |
| units.json | 31 | rentinfo#1.xls | 2026-04-02 | ✅ Bldg 1 full; others pending |
| tenants.json | 13 | rentinfo#1.xls | 2026-04-02 | ✅ Bldg 1 full; others pending |
| leases.json | 13 | rentinfo#1.xls + lease PDFs | 2026-04-02 | ✅ Bldg 1 full; others pending |
| hoa-lots.json | 45 | Lakeside Village CSV | 2026-04-02 | ✅ Complete |

*Buildings #2–5 and all residential properties require Clerical Data Agent run when source files are provided.*
