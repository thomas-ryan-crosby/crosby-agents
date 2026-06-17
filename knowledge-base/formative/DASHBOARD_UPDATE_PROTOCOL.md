# Dashboard Update Protocol

**Version:** 2.0
**Updated:** April 13, 2026

---

## Purpose

After every agent run, the dashboard must reflect the latest state. The dashboard polls `data/dashboard-state.json` every 30 seconds and re-renders when changes are detected.

---

## How It Works

**The sync script handles everything automatically.** You do NOT need to manually edit `data/dashboard-state.json`.

The script `scripts/sync-dashboard.py`:
1. Scans `knowledge-base/outputs/*/` for all `.md` output files
2. Parses their headers to extract agent name, date, title, status, property
3. Cross-references against existing entries in `dashboard-state.json`
4. Adds any missing document + activity entries
5. Updates agent `lastRun` timestamps from the most recent output file
6. Writes the updated JSON

---

## What Every Agent Must Do (Post-Run)

### Step 1: Write your output file

Write your output to `knowledge-base/outputs/<your-agent-folder>/` as a `.md` file.

**Required header format** (first ~10 lines of the file):

```markdown
# <Title of the Output>
## <Subtitle — property name or scope>

**Agent:** <Agent Display Name>
**Scan Date:** <Month Day, Year>    (or **Generated:** or **Date:** or **Report Date:**)
**Property:** <Property address or name>
**Status:** Pending Review           (or ⏳ Pending Review, ✅ Approved, etc.)

---
```

The sync script parses these fields to build dashboard entries. If your header is malformed, the output won't appear on the dashboard.

### Step 2: Run the sync script

```bash
python3 scripts/sync-dashboard.py
```

That's it. The script will:
- Detect your new output file
- Add it to `dashboard-state.json` as a document and activity entry
- Update your agent's `lastRun` timestamp
- Set `_meta.lastUpdated` so the dashboard picks up the change on next poll

### Step 3 (optional): Update your SUMMARY.md

Append a line to `knowledge-base/outputs/<your-agent-folder>/SUMMARY.md` for your own index.

---

## Passing Scheduled Task Timestamps

If you know the Cowork scheduler `lastRunAt` values, you can pass them:

```bash
# Create a temp JSON with task timestamps
echo '[{"taskId": "lease-intelligence-weekly", "lastRunAt": "2026-04-13T13:14:44Z"}]' > /tmp/sched.json
python3 scripts/sync-dashboard.py --scheduled-runs /tmp/sched.json
```

This updates the `scheduled[]` array in dashboard-state.json with real run times.

---

## Safety Net

A daily scheduled task (`dashboard-sync-daily`) runs the sync script automatically every morning. This catches any outputs that agents forgot to sync.

---

## File Locations

| File | Purpose |
|------|---------|
| `data/dashboard-state.json` | Live dashboard state — polled by the HTML dashboard every 30 seconds |
| `scripts/sync-dashboard.py` | Sync script — scans outputs, updates the JSON |
| `knowledge-base/outputs/*/` | Agent output directories — one folder per agent |

---

## Output Folder Names → Agent Slugs

| Folder | Agent Slug |
|--------|-----------|
| `lease-intelligence` | `lease-intelligence-agent` |
| `vacancy-marketing` | `vacancy-marketing-agent` |
| `market-intelligence` | `market-intelligence-agent` |
| `rent-roll-intelligence` | `rent-roll-intelligence-agent` |
| `hoa-management` | `hoa-management-agent` |
| `residential-leasing` | `residential-leasing-agent` |
| `clerical-data` | `clerical-data-agent` |
| `investor-relations` | `investor-relations-agent` |
| `acquisitions` | `acquisitions-agent` |

---

## Agent Reference Table

| Agent | Slug | Icon | Color | Typical type |
|-------|------|------|-------|-------------|
| Clerical Data | `clerical-data-agent` | `database` | `#374151` | `import` |
| Lease Intelligence | `lease-intelligence-agent` | `clock` | `#dc2626` | `scan`, `letter` |
| Vacancy Marketing | `vacancy-marketing-agent` | `file-text` | `#d97706` | `listing` |
| Rent Roll Intelligence | `rent-roll-intelligence-agent` | `bar-chart-2` | `#2563eb` | `report` |
| HOA Management | `hoa-management-agent` | `home` | `#7c3aed` | `alert`, `report` |
| Residential Leasing | `residential-leasing-agent` | `key` | `#059669` | `listing`, `letter` |
| Market Intelligence | `market-intelligence-agent` | `trending-up` | `#0891b2` | `report` |
| Investor Relations | `investor-relations-agent` | `briefcase` | `#6366f1` | `report` |
| Acquisitions | `acquisitions-agent` | `search` | `#f59e0b` | `report`, `scan` |
