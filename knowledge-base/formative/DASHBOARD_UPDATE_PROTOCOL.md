# Dashboard Update Protocol

**Version:** 1.0
**Issued:** April 2, 2026

---

## Purpose

After every agent run — whether manual, scheduled, or event-driven — the agent must update `data/dashboard-state.json` so the dashboard reflects the latest state without manual intervention. The dashboard polls this file every 30 seconds and re-renders when changes are detected.

---

## File Location

```
data/dashboard-state.json
```

---

## What to Update

Every agent run must update **all four sections** that are relevant to its output:

### 1. `_meta.lastUpdated`

Set to the current ISO timestamp. This is how the dashboard detects changes.

```json
"_meta": {
  "lastUpdated": "2026-04-15T08:00:00Z",
  "updatedBy": "lease-intelligence-agent"
}
```

### 2. `agentStatuses.[your-slug]`

Update your agent's entry with the current run timestamp and last output ID.

```json
"agentStatuses": {
  "lease-intelligence-agent": {
    "status": "active",
    "lastRun": "2026-04-15T08:00:00Z",
    "lastOutput": "bldg1-lease-review-2026-04"
  }
}
```

**Status values:**
- `"planned"` — agent prompt not yet written
- `"building"` — agent prompt exists but not yet tested/deployed
- `"active"` — agent has run at least once and is operational

### 3. `scheduled.[taskId]`

If this run was triggered by a scheduled task, update the matching entry:

```json
{
  "taskId": "lease-intelligence-weekly",
  "lastRun": "2026-04-15T08:00:00Z",
  "lastResult": "success"
}
```

**`lastResult` values:** `"success"` or `"error"`

### 4. `documents[]`

Append a new entry for each output file produced. Use this exact schema:

```json
{
  "id": "unique-doc-id",
  "title": "Human-readable title",
  "category": "Agent Output",
  "icon": "clock",
  "color": "#dc2626",
  "lastUpdated": "2026-04-15",
  "status": "pending_review",
  "agentSlug": "lease-intelligence-agent",
  "propertySlug": "sanctuary-office-park",
  "description": "Brief description of what this output contains and any key findings.",
  "file": "knowledge-base/outputs/lease-intelligence/filename.md"
}
```

**Icon and color:** Match your agent's icon and color from the AGENTS roster in the dashboard.

**Do NOT duplicate:** Before appending, check if a document with the same `id` already exists. If it does, update its `lastUpdated`, `status`, and `description` fields instead of creating a duplicate.

### 5. `activity[]`

Prepend a new activity entry (most recent first):

```json
{
  "id": "act-unique-id",
  "timestamp": "2026-04-15T08:00:00Z",
  "agent": "lease-intelligence-agent",
  "type": "scan",
  "title": "Weekly Lease Deadline Scan",
  "description": "Brief summary of what happened in this run.",
  "status": "pending_review",
  "documentId": "bldg1-lease-review-2026-04",
  "property": "sanctuary-office-park"
}
```

**Activity `type` values:** `"scan"`, `"report"`, `"letter"`, `"listing"`, `"alert"`, `"import"`

**Activity `id`:** Use format `act-[agent-abbr]-[YYYYMMDD]-[seq]`, e.g., `act-li-20260415-001`

---

## How to Update

### Read-Modify-Write Pattern

1. **Read** the current `data/dashboard-state.json`
2. **Parse** it as JSON
3. **Modify** the relevant sections (never delete existing entries from `documents[]` or `activity[]`)
4. **Write** the updated JSON back to `data/dashboard-state.json`

### Important Rules

- **Never overwrite the entire file from scratch.** Always read first, modify, then write.
- **Preserve all existing entries.** Other agents may have written entries you don't control.
- **Use ISO 8601 timestamps** with timezone: `2026-04-15T08:00:00Z`
- **Keep `activity[]` sorted** by timestamp descending (newest first).
- **Limit `activity[]` to 50 entries.** If the array exceeds 50, trim the oldest entries.
- **Document `id` values must be unique** across all documents. Use the same naming convention as your output filenames (without extension).

---

## Example: Full Post-Run Update

After the Lease Intelligence Agent completes a weekly scan:

```
1. Read data/dashboard-state.json
2. Update _meta.lastUpdated and _meta.updatedBy
3. Update agentStatuses.lease-intelligence-agent.lastRun and .lastOutput
4. Update scheduled[taskId="lease-intelligence-weekly"].lastRun and .lastResult
5. Append new document entry for the scan output
6. Prepend new activity entry
7. Write updated JSON back to data/dashboard-state.json
```

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
