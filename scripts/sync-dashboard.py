#!/usr/bin/env python3
"""
DEPRECATED (June 2026) — superseded by scripts/sync-firestore.mjs.

The dashboard now reads live data from Firestore, not data/dashboard-state.json,
and is served over HTTP (Vercel), so the dashboard.html string-patching this
script performs is obsolete. Use `npm run sync` (scripts/sync-firestore.mjs)
after each agent run instead. Kept for reference / local file:// fallback only.

─────────────────────────────────────────────────────────────────────────────
sync-dashboard.py — Keeps dashboard-state.json current by scanning the filesystem.

This script is the single source of truth for dashboard updates. Instead of relying
on each agent to manually edit JSON after every run, this script:

  1. Scans knowledge-base/outputs/*/ for all .md files
  2. Parses their headers to extract agent, date, title, status, property
  3. Cross-references against existing dashboard-state.json entries
  4. Adds any missing document + activity entries
  5. Updates agent lastRun timestamps based on most recent output file
  6. Updates scheduled task lastRun from a provided timestamps file (optional)
  7. Writes the updated JSON back

Run after any agent completes, or on a schedule as a safety net.

Usage:
    python3 scripts/sync-dashboard.py                          # from repo root
    python3 scripts/sync-dashboard.py --scheduled-runs runs.json  # with task timestamps
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = REPO_ROOT / "data" / "dashboard-state.json"
OUTPUTS_DIR = REPO_ROOT / "knowledge-base" / "outputs"

# ── Agent slug mapping (folder name → agent slug) ─────────────────────────────
FOLDER_TO_AGENT = {
    "lease-intelligence":    "lease-intelligence-agent",
    "vacancy-marketing":     "vacancy-marketing-agent",
    "market-intelligence":   "market-intelligence-agent",
    "rent-roll-intelligence":"rent-roll-intelligence-agent",
    "hoa-management":        "hoa-management-agent",
    "residential-leasing":   "residential-leasing-agent",
    "clerical-data":         "clerical-data-agent",
    "investor-relations":    "investor-relations-agent",
    "acquisitions":          "acquisitions-agent",
}

# ── Agent display names ───────────────────────────────────────────────────────
AGENT_NAMES = {
    "lease-intelligence-agent":    "Lease Intelligence",
    "vacancy-marketing-agent":     "Vacancy Marketing",
    "market-intelligence-agent":   "Market Intelligence",
    "rent-roll-intelligence-agent":"Rent Roll Intelligence",
    "hoa-management-agent":        "HOA Management",
    "residential-leasing-agent":   "Residential Leasing",
    "clerical-data-agent":         "Clerical Data",
    "investor-relations-agent":    "Investor Relations",
    "acquisitions-agent":          "Acquisitions",
}

# ── Property slug mapping (heuristic from file content) ───────────────────────
PROPERTY_KEYWORDS = {
    "sanctuary office":    "sanctuary-office-park",
    "sanctuary blvd":      "sanctuary-office-park",
    "mandeville lake":     "mandeville-lake-apartments",
    "metairie plaza":      "metairie-plaza",
    "metairie lake":       "metairie-lake-apartments",
    "lakeside village":    "lakeside-village-townhomes",
    "gulf south":          "gulf-south-commerce-park",
    "delimon":             "delimon-place",
    "the sanctuary":       "the-sanctuary",
}

# ── Document category & type mapping ──────────────────────────────────────────
def guess_doc_type(filename, title):
    """Guess the document type from filename and title."""
    fn = filename.lower()
    t = title.lower()
    if "renewal" in fn or "renewal" in t:
        return "letter"
    if "listing" in fn or "listing" in t:
        return "report"
    if "brief" in fn or "brief" in t:
        return "report"
    if "email" in fn or "blast" in t:
        return "report"
    if "scan" in fn or "review" in fn:
        return "scan"
    if "snapshot" in fn or "comps" in fn or "comp" in fn:
        return "report"
    return "report"


def parse_output_file(filepath):
    """Parse an agent output .md file and extract metadata from its header."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read(3000)  # Only need the header
    except Exception:
        return None

    meta = {
        "filepath": str(filepath),
        "filename": filepath.name,
        "file_id": filepath.stem,  # e.g. weekly-scan-2026-04-12
        "folder": filepath.parent.name,  # e.g. lease-intelligence
        "mtime": datetime.fromtimestamp(filepath.stat().st_mtime, tz=timezone.utc),
    }

    # Extract title from first # heading
    m = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    meta["title"] = m.group(1).strip() if m else filepath.stem.replace("-", " ").title()

    # Extract subtitle (## line right after title)
    m = re.search(r'^##\s+(.+)$', content, re.MULTILINE)
    meta["subtitle"] = m.group(1).strip() if m else ""

    # Extract **Agent:** field
    m = re.search(r'\*\*Agent:\*\*\s*(.+)', content)
    meta["agent_name"] = m.group(1).strip() if m else None

    # Extract **Status:** field
    m = re.search(r'\*\*Status:\*\*\s*(.+)', content)
    raw_status = m.group(1).strip() if m else "pending_review"
    if "pending" in raw_status.lower() or "⏳" in raw_status:
        meta["status"] = "pending_review"
    elif "approved" in raw_status.lower() or "✅" in raw_status:
        meta["status"] = "approved"
    elif "rejected" in raw_status.lower():
        meta["status"] = "rejected"
    else:
        meta["status"] = "pending_review"

    # Extract date from **Scan Date:**, **Generated:**, or **Date:** fields
    for pattern in [
        r'\*\*Scan Date:\*\*\s*(.+)',
        r'\*\*Generated:\*\*\s*(.+)',
        r'\*\*Date:\*\*\s*(.+)',
        r'\*\*Report Date:\*\*\s*(.+)',
    ]:
        m = re.search(pattern, content)
        if m:
            meta["date_str"] = m.group(1).strip()
            break
    else:
        meta["date_str"] = None

    # Extract **Property:** field
    m = re.search(r'\*\*Property:\*\*\s*(.+)', content)
    meta["property_str"] = m.group(1).strip() if m else None

    # Extract first paragraph after --- as description
    parts = content.split("---")
    if len(parts) >= 3:
        desc_section = parts[2].strip()
        # Get first paragraph or blockquote
        lines = []
        for line in desc_section.split("\n"):
            line = line.strip()
            if not line:
                if lines:
                    break
                continue
            # Strip markdown blockquote markers
            line = re.sub(r'^>\s*', '', line)
            # Strip bold markers
            line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
            lines.append(line)
        meta["description"] = " ".join(lines)[:300] if lines else ""
    else:
        meta["description"] = meta["title"]

    # Resolve agent slug
    meta["agent_slug"] = FOLDER_TO_AGENT.get(meta["folder"])

    # Resolve property slug from property_str or subtitle
    meta["property_slug"] = None
    search_text = (
        (meta.get("property_str") or "") + " " +
        (meta.get("subtitle") or "") + " " +
        (meta.get("title") or "")
    ).lower()
    for keyword, slug in PROPERTY_KEYWORDS.items():
        if keyword in search_text:
            meta["property_slug"] = slug
            break

    # Guess doc type
    meta["doc_type"] = guess_doc_type(meta["filename"], meta["title"])

    return meta


def scan_outputs():
    """Scan all output directories and return parsed file metadata."""
    results = []
    if not OUTPUTS_DIR.exists():
        return results

    for agent_dir in sorted(OUTPUTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        for md_file in sorted(agent_dir.glob("*.md")):
            # Skip SUMMARY.md files — those are indexes, not outputs
            if md_file.name == "SUMMARY.md":
                continue
            meta = parse_output_file(md_file)
            if meta:
                results.append(meta)

    return results


def load_state():
    """Load current dashboard-state.json."""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        return {
            "_meta": {"version": "1.0", "lastUpdated": None, "updatedBy": None,
                      "description": "Dynamic dashboard state — updated by agents after each run."},
            "agentStatuses": {},
            "scheduled": [],
            "documents": [],
            "activity": [],
        }


def save_state(state):
    """Write updated dashboard-state.json."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    print(f"  ✓ Wrote {STATE_FILE}")


def sync():
    """Main sync: scan files → update state → write."""
    print("┌─ Dashboard Sync ─────────────────────────────────────")
    print(f"│  Repo root: {REPO_ROOT}")
    print(f"│  State file: {STATE_FILE}")
    print(f"│  Outputs dir: {OUTPUTS_DIR}")

    # 1. Load current state
    state = load_state()
    existing_doc_ids = {d["id"] for d in state.get("documents", [])}
    existing_activity_ids = {a["id"] for a in state.get("activity", [])}
    print(f"│  Existing docs: {len(existing_doc_ids)}, activities: {len(existing_activity_ids)}")

    # 2. Scan output files
    outputs = scan_outputs()
    print(f"│  Output files found: {len(outputs)}")

    # 3. Track latest run per agent (from file mtimes)
    agent_latest = {}  # agent_slug → latest mtime

    added_docs = 0
    added_activities = 0

    for meta in outputs:
        file_id = meta["file_id"]
        agent_slug = meta["agent_slug"]

        # Track latest run per agent
        if agent_slug:
            if agent_slug not in agent_latest or meta["mtime"] > agent_latest[agent_slug]["mtime"]:
                agent_latest[agent_slug] = meta

        # Skip if already registered
        if file_id in existing_doc_ids:
            continue

        # Build display title (combine title + subtitle if available)
        display_title = meta["title"]
        if meta["subtitle"] and meta["subtitle"] not in display_title:
            display_title = f"{meta['title']} — {meta['subtitle']}"

        # Determine icon and color from agent
        icon_map = {
            "lease-intelligence-agent": ("clock", "#d97706"),
            "vacancy-marketing-agent": ("megaphone", "#dc2626"),
            "market-intelligence-agent": ("trending-up", "#2563eb"),
            "rent-roll-intelligence-agent": ("bar-chart-3", "#7c3aed"),
            "hoa-management-agent": ("home", "#059669"),
            "residential-leasing-agent": ("key", "#0891b2"),
            "clerical-data-agent": ("database", "#374151"),
            "investor-relations-agent": ("briefcase", "#4f46e5"),
            "acquisitions-agent": ("search", "#be123c"),
        }
        icon, color = icon_map.get(agent_slug, ("file-text", "#6b7280"))

        # Add as Agent Output document
        doc_entry = {
            "id": file_id,
            "title": display_title,
            "category": "Agent Output",
            "icon": icon,
            "color": color,
            "agentSlug": agent_slug,
            "lastUpdated": meta["mtime"].strftime("%Y-%m-%d"),
            "status": meta["status"],
            "description": meta["description"][:200],
            "file": str(Path(meta["filepath"]).relative_to(REPO_ROOT)),
        }
        state["documents"].append(doc_entry)
        existing_doc_ids.add(file_id)
        added_docs += 1

        # Add matching activity entry
        act_id = f"act-{file_id}"
        if act_id not in existing_activity_ids:
            act_entry = {
                "id": act_id,
                "timestamp": meta["mtime"].strftime("%Y-%m-%dT%H:%M:%SZ"),
                "agent": agent_slug,
                "type": meta["doc_type"],
                "title": display_title,
                "description": meta["description"][:200],
                "status": meta["status"],
                "documentId": file_id,
                "property": meta["property_slug"],
            }
            state["activity"].append(act_entry)
            existing_activity_ids.add(act_id)
            added_activities += 1

    print(f"│  Added {added_docs} new docs, {added_activities} new activities")

    # 4. Update agent statuses based on latest output files
    agent_statuses = state.get("agentStatuses", {})
    for agent_slug, latest_meta in agent_latest.items():
        if agent_slug in agent_statuses:
            current_last = agent_statuses[agent_slug].get("lastRun")
            file_ts = latest_meta["mtime"].strftime("%Y-%m-%dT%H:%M:%SZ")
            # Update if file is newer
            if not current_last or file_ts > current_last:
                agent_statuses[agent_slug]["lastRun"] = file_ts
                agent_statuses[agent_slug]["lastOutput"] = latest_meta["file_id"]
                agent_statuses[agent_slug]["status"] = "active"
                print(f"│  Updated {agent_slug} lastRun → {file_ts}")

    # 5. Update scheduled task lastRun from Cowork scheduler data (if provided)
    #    Pass --scheduled-runs <file> with JSON like:
    #    [{"taskId": "lease-intelligence-weekly", "lastRunAt": "2026-04-13T13:14:44Z"}, ...]
    scheduled_runs_file = None
    if "--scheduled-runs" in sys.argv:
        idx = sys.argv.index("--scheduled-runs")
        if idx + 1 < len(sys.argv):
            scheduled_runs_file = sys.argv[idx + 1]

    if scheduled_runs_file and os.path.exists(scheduled_runs_file):
        with open(scheduled_runs_file, "r") as f:
            sched_data = json.load(f)
        sched_by_id = {s["taskId"]: s for s in sched_data}
        for task in state.get("scheduled", []):
            tid = task.get("taskId")
            if tid in sched_by_id and sched_by_id[tid].get("lastRunAt"):
                new_ts = sched_by_id[tid]["lastRunAt"]
                old_ts = task.get("lastRun")
                if not old_ts or new_ts > old_ts:
                    task["lastRun"] = new_ts
                    task["lastResult"] = "success"
                    print(f"│  Updated scheduled task {tid} lastRun → {new_ts}")

    # 6. Sort activity by timestamp (newest first), trim to 50
    state["activity"].sort(key=lambda a: a.get("timestamp", ""), reverse=True)
    if len(state["activity"]) > 50:
        state["activity"] = state["activity"][:50]

    # 7. Update _meta
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state["_meta"]["lastUpdated"] = now
    state["_meta"]["updatedBy"] = "sync-dashboard"

    # 8. Write JSON state
    save_state(state)

    # 9. Patch dashboard.html hardcoded defaults (for file:// mode)
    patch_dashboard_html(state)

    print(f"│  _meta.lastUpdated → {now}")
    print("└──────────────────────────────────────────────────────")
    return added_docs + added_activities


# ── Dashboard HTML patching ────────────────────────────────────────────────
DASHBOARD_HTML = REPO_ROOT / "dashboard.html"

def patch_dashboard_html(state):
    """Patch the hardcoded DOCUMENTS, activities, SCHEDULED, and AGENTS arrays
    in dashboard.html so the dashboard works correctly in file:// mode
    (where fetch() to dashboard-state.json fails)."""
    if not DASHBOARD_HTML.exists():
        print("│  ⚠ dashboard.html not found — skipping HTML patch")
        return

    html = DASHBOARD_HTML.read_text(encoding="utf-8")
    patched = False

    # ── Patch DOCUMENTS array ──────────────────────────────────────────────
    docs_js = build_documents_js(state.get("documents", []))
    html, did_patch = replace_between_markers(
        html,
        "var DOCUMENTS = [",
        "];",
        f"var DOCUMENTS = [\n{docs_js}\n];",
        first_occurrence_after="// ── Formative" if "// ── Formative" in html else None,
    )
    if did_patch:
        patched = True
        print(f"│  ✓ Patched DOCUMENTS ({len(state.get('documents',[]))} entries)")

    # ── Patch activities array ─────────────────────────────────────────────
    acts_js = build_activities_js(state.get("activity", []))
    html, did_patch = replace_between_markers(
        html,
        "let activities = [",
        "];",
        f"let activities = [\n{acts_js}\n];",
    )
    if did_patch:
        patched = True
        print(f"│  ✓ Patched activities ({len(state.get('activity',[]))} entries)")

    # ── Patch SCHEDULED lastRun values ─────────────────────────────────────
    for task in state.get("scheduled", []):
        tid = task.get("taskId", "")
        lr = task.get("lastRun")
        if tid and lr:
            # Find the line with this taskId and update its lastRun
            import re as _re
            pattern = _re.compile(
                r'(taskId:"' + _re.escape(tid) + r'".*?lastRun:")[^"]*(")',
                _re.DOTALL,
            )
            new_html, n = pattern.subn(r'\g<1>' + lr + r'\2', html)
            if n > 0:
                html = new_html

    # ── Patch agent lastRun values ─────────────────────────────────────────
    for slug, info in state.get("agentStatuses", {}).items():
        lr = info.get("lastRun")
        st = info.get("status", "planned")
        if slug and lr:
            import re as _re
            pattern = _re.compile(
                r'(slug:\s*"' + _re.escape(slug) + r'".*?status:\s*")[^"]*(".*?lastRun:\s*")[^"]*(")',
                _re.DOTALL,
            )
            new_html, n = pattern.subn(r'\g<1>' + st + r'\2' + lr + r'\3', html)
            if n > 0:
                html = new_html

    if patched:
        DASHBOARD_HTML.write_text(html, encoding="utf-8")
        print(f"  ✓ Patched {DASHBOARD_HTML}")


def replace_between_markers(html, start_marker, end_marker, replacement, first_occurrence_after=None):
    """Replace content between start_marker and the next end_marker."""
    start_idx = html.find(start_marker)
    if start_idx == -1:
        return html, False
    # Find the end marker AFTER the start
    end_search_start = start_idx + len(start_marker)
    end_idx = html.find(end_marker, end_search_start)
    if end_idx == -1:
        return html, False
    end_idx += len(end_marker)
    return html[:start_idx] + replacement + html[end_idx:], True


def build_documents_js(documents):
    """Build the JS array contents for var DOCUMENTS = [...]."""
    lines = []
    lines.append("  // ── Formative ──────────────────────────────────────────────────────────────")
    for d in documents:
        if d.get("category") != "Formative":
            continue
        lines.append(f'  {{ id:"{d["id"]}", title:"{esc(d["title"])}", category:"Formative", icon:"{d.get("icon","file-text")}", color:"{d.get("color","#6b7280")}", lastUpdated:"{d.get("lastUpdated","")}", status:"{d.get("status","active")}", description:"{esc(d.get("description",""))}", file:"{d.get("file","")}" }},')
    lines.append("  // ── Agent Outputs ──────────────────────────────────────────────────────────")
    for d in documents:
        if d.get("category") != "Agent Output":
            continue
        agent_slug = d.get("agentSlug", "")
        prop_slug = d.get("property") or d.get("propertySlug") or ""
        agent_part = f', agentSlug:"{agent_slug}"' if agent_slug else ""
        prop_part = f', propertySlug:"{prop_slug}"' if prop_slug else ""
        lines.append(f'  {{ id:"{d["id"]}", title:"{esc(d["title"])}", category:"Agent Output", icon:"{d.get("icon","file-text")}", color:"{d.get("color","#6b7280")}", lastUpdated:"{d.get("lastUpdated","")}", status:"{d.get("status","pending_review")}"{agent_part}{prop_part}, description:"{esc(d.get("description",""))}", file:"{d.get("file","")}" }},')
    return "\n".join(lines)


def build_activities_js(activities):
    """Build the JS array contents for let activities = [...]."""
    lines = []
    for a in activities:
        title = esc(a.get("title", ""))
        desc = esc(a.get("description", ""))
        prop = a.get("property") or "null"
        prop_str = f'"{prop}"' if prop != "null" else "null"
        doc_id = a.get("documentId") or "null"
        doc_str = f'"{doc_id}"' if doc_id != "null" else "null"
        lines.append(f'  {{ id:"{a["id"]}", timestamp:"{a.get("timestamp","")}", agent:"{a.get("agent","")}", type:"{a.get("type","report")}", title:"{title}", task:"{title}", description:"{desc}", status:"{a.get("status","pending_review")}", documentId:{doc_str}, property:{prop_str} }},')
    return "\n".join(lines)


def esc(s):
    """Escape a string for embedding in JS double-quoted strings."""
    if not s:
        return ""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", "")


if __name__ == "__main__":
    changes = sync()
    sys.exit(0 if changes >= 0 else 1)
