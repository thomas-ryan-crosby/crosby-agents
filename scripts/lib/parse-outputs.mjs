// Shared parser for agent output markdown files.
// Ported from scripts/sync-dashboard.py (parse_output_file / guess_doc_type and
// the slug/icon lookup tables) so seed-firestore.mjs and sync-firestore.mjs use
// identical logic.

import { readFileSync, statSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

// Folder name → agent slug
export const FOLDER_TO_AGENT = {
  "lease-intelligence":     "lease-intelligence-agent",
  "vacancy-marketing":      "vacancy-marketing-agent",
  "market-intelligence":    "market-intelligence-agent",
  "rent-roll-intelligence": "rent-roll-intelligence-agent",
  "hoa-management":         "hoa-management-agent",
  "residential-leasing":    "residential-leasing-agent",
  "clerical-data":          "clerical-data-agent",
  "investor-relations":     "investor-relations-agent",
  "acquisitions":           "acquisitions-agent",
};

// Property keyword → slug (heuristic match against file content)
export const PROPERTY_KEYWORDS = {
  "sanctuary office": "sanctuary-office-park",
  "sanctuary blvd":   "sanctuary-office-park",
  "mandeville lake":  "mandeville-lake-apartments",
  "metairie plaza":   "metairie-plaza",
  "metairie lake":    "metairie-lake-apartments",
  "lakeside village": "lakeside-village-townhomes",
  "gulf south":       "gulf-south-commerce-park",
  "delimon":          "delimon-place",
  "the sanctuary":    "the-sanctuary",
};

// Agent slug → [icon, color] for document/activity entries
export const ICON_MAP = {
  "lease-intelligence-agent":     ["clock", "#d97706"],
  "vacancy-marketing-agent":      ["megaphone", "#dc2626"],
  "market-intelligence-agent":    ["trending-up", "#2563eb"],
  "rent-roll-intelligence-agent": ["bar-chart-3", "#7c3aed"],
  "hoa-management-agent":         ["home", "#059669"],
  "residential-leasing-agent":    ["key", "#0891b2"],
  "clerical-data-agent":          ["database", "#374151"],
  "investor-relations-agent":     ["briefcase", "#4f46e5"],
  "acquisitions-agent":           ["search", "#be123c"],
};

export function guessDocType(filename, title) {
  const fn = filename.toLowerCase();
  const t = (title || "").toLowerCase();
  if (fn.includes("renewal") || t.includes("renewal")) return "letter";
  if (fn.includes("listing") || t.includes("listing")) return "report";
  if (fn.includes("brief")   || t.includes("brief"))   return "report";
  if (fn.includes("email")   || t.includes("blast"))   return "report";
  if (fn.includes("scan")    || fn.includes("review")) return "scan";
  if (fn.includes("snapshot")|| fn.includes("comp"))   return "report";
  return "report";
}

function firstMatch(re, text) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// Parse one .md output file → metadata object (mirrors the Python parser).
// `body` holds the FULL file content (stored inline in Firestore documents).
export function parseOutputFile(filepath, repoRoot) {
  let content;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return null;
  }
  const header = content.slice(0, 3000); // metadata lives in the header
  const file = basename(filepath);
  const folder = basename(dirname(filepath));
  const fileId = basename(filepath, extname(filepath));
  const mtime = new Date(statSync(filepath).mtimeMs);

  const title = firstMatch(/^#\s+(.+)$/m, header) ||
    fileId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subtitle = firstMatch(/^##\s+(.+)$/m, header) || "";
  const agentName = firstMatch(/\*\*Agent:\*\*\s*(.+)/, header);

  const rawStatus = firstMatch(/\*\*Status:\*\*\s*(.+)/, header) || "pending_review";
  let status = "pending_review";
  const rs = rawStatus.toLowerCase();
  if (rs.includes("pending") || rawStatus.includes("⏳")) status = "pending_review";
  else if (rs.includes("approved") || rawStatus.includes("✅")) status = "approved";
  else if (rs.includes("rejected")) status = "rejected";

  const dateStr =
    firstMatch(/\*\*Scan Date:\*\*\s*(.+)/, header) ||
    firstMatch(/\*\*Generated:\*\*\s*(.+)/, header) ||
    firstMatch(/\*\*Date:\*\*\s*(.+)/, header) ||
    firstMatch(/\*\*Report Date:\*\*\s*(.+)/, header) || null;

  const propertyStr = firstMatch(/\*\*Property:\*\*\s*(.+)/, header);

  // Description = first paragraph after the header rule (---)
  let description = title;
  const parts = header.split("---");
  if (parts.length >= 3) {
    const lines = [];
    for (let line of parts[2].split("\n")) {
      line = line.trim();
      if (!line) { if (lines.length) break; else continue; }
      line = line.replace(/^>\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1");
      lines.push(line);
    }
    if (lines.length) description = lines.join(" ").slice(0, 300);
  }

  const agentSlug = FOLDER_TO_AGENT[folder] || null;

  const searchText = `${propertyStr || ""} ${subtitle} ${title}`.toLowerCase();
  let propertySlug = null;
  for (const [kw, slug] of Object.entries(PROPERTY_KEYWORDS)) {
    if (searchText.includes(kw)) { propertySlug = slug; break; }
  }

  const [icon, color] = ICON_MAP[agentSlug] || ["file-text", "#6b7280"];

  return {
    fileId, file, folder, mtime,
    title, subtitle, agentName, status, dateStr,
    propertyStr, description, agentSlug, propertySlug,
    docType: guessDocType(file, title),
    icon, color,
    body: content,
    relPath: repoRoot ? relative(repoRoot, filepath).split("\\").join("/") : filepath,
  };
}

// Scan knowledge-base/outputs/*/*.md (skipping SUMMARY.md) → parsed metadata[]
export function scanOutputs(outputsDir, repoRoot) {
  const results = [];
  let agentDirs;
  try { agentDirs = readdirSync(outputsDir, { withFileTypes: true }); }
  catch { return results; }
  for (const d of agentDirs.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!d.isDirectory()) continue;
    const dir = join(outputsDir, d.name);
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".md") || f === "SUMMARY.md") continue;
      const meta = parseOutputFile(join(dir, f), repoRoot);
      if (meta) results.push(meta);
    }
  }
  return results;
}

// Build a Firestore `documents/{id}` payload from parsed output metadata.
export function toDocumentEntry(meta) {
  let displayTitle = meta.title;
  if (meta.subtitle && !displayTitle.includes(meta.subtitle)) {
    displayTitle = `${meta.title} — ${meta.subtitle}`;
  }
  return {
    id: meta.fileId,
    title: displayTitle,
    category: "Agent Output",
    icon: meta.icon,
    color: meta.color,
    agentSlug: meta.agentSlug,
    propertySlug: meta.propertySlug,
    lastUpdated: meta.mtime.toISOString().slice(0, 10),
    status: meta.status,
    description: (meta.description || "").slice(0, 200),
    file: meta.relPath,
    body: meta.body,
  };
}

// Build a Firestore `activity/{id}` payload from parsed output metadata.
export function toActivityEntry(meta) {
  let displayTitle = meta.title;
  if (meta.subtitle && !displayTitle.includes(meta.subtitle)) {
    displayTitle = `${meta.title} — ${meta.subtitle}`;
  }
  return {
    id: `act-${meta.fileId}`,
    timestamp: meta.mtime.toISOString().replace(/\.\d+Z$/, "Z"),
    agent: meta.agentSlug,
    type: meta.docType,
    title: displayTitle,
    description: (meta.description || "").slice(0, 200),
    status: meta.status,
    documentId: meta.fileId,
    property: meta.propertySlug,
  };
}
