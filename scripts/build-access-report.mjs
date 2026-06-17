// Generates a self-contained HTML report mapping every suite (and building-wide
// entry point) to its access instructions, from data/access-instructions.json.
// Writes to the user's Downloads folder.
//
//   node scripts/build-access-report.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(readFileSync(join(here, "..", "data", "access-instructions.json"), "utf8"));
const OUT = join(homedir(), "Downloads", "Sanctuary-Office-Park-Access-Instructions.html");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const METHOD = { "keypad": "Keypad", "scan-card": "Scan card", "fob + keypad": "Fob + keypad", "key": "Key", "alarm": "Alarm", "combination": "Combination", "unlocked": "Unlocked", "no-access": "No access", "key + keypad": "Key + keypad" };
const ml = (m) => METHOD[m] || (m ? m[0].toUpperCase() + m.slice(1) : "");

function accessCell(a) {
  const parts = [];
  if (a.method) parts.push(`<span class="method m-${(a.method || "").replace(/[^a-z]/g, "")}">${esc(ml(a.method))}</span>`);
  if (a.code) parts.push(`<span class="code">${esc(a.code)}</span>`);
  if (a.altCode) parts.push(`<span class="muted">or</span> <span class="code">${esc(a.altCode)}</span>`);
  let html = parts.join(" ");
  if (a.keyDescription) html += `<div class="key">${esc(a.keyDescription)}</div>`;
  return html || '<span class="muted">—</span>';
}
const notesCell = (a) => (a.notes ? `<span class="notes${a.sensitive ? " sensitive" : ""}">${a.sensitive ? '<span class="sens">sensitive</span> ' : ""}${esc(a.notes)}</span>` : '<span class="muted">—</span>');
const bySort = (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0);

// ── group ──
const bids = [...new Set(rows.filter((r) => r.buildingId).map((r) => r.buildingId))].sort();
const policy = rows.filter((r) => !r.buildingId && r.area === "policy").sort(bySort);
const clubhouse = rows.filter((r) => r.building === "Clubhouse").sort(bySort);

function suiteTable(suites) {
  if (!suites.length) return "";
  const body = suites.map((a) => `<tr>
    <td class="c-suite">${esc(a.suite)}</td>
    <td class="c-tenant">${a.tenant ? esc(a.tenant) : '<span class="muted">—</span>'}</td>
    <td class="c-access">${accessCell(a)}</td>
    <td class="c-notes">${notesCell(a)}</td></tr>`).join("");
  return `<table class="rep"><thead><tr><th>Suite</th><th>Tenant</th><th>Access</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table>`;
}
function areaTable(items, firstCol) {
  if (!items.length) return "";
  const body = items.map((a) => `<tr>
    <td class="c-area">${a.level ? `<span class="lvl">L${a.level}</span> ` : ""}${esc(a.label)}</td>
    <td class="c-access">${accessCell(a)}</td>
    <td class="c-notes">${notesCell(a)}</td></tr>`).join("");
  return `<table class="rep"><thead><tr><th>${firstCol}</th><th>Access</th><th>Notes</th></tr></thead><tbody>${body}</tbody></table>`;
}

let buildingsHTML = "";
for (const bid of bids) {
  const name = (rows.find((r) => r.buildingId === bid) || {}).building || bid;
  const wide = rows.filter((r) => r.buildingId === bid && r.area !== "suite").sort(bySort);
  const suites = rows.filter((r) => r.buildingId === bid && r.area === "suite")
    .sort((a, b) => String(a.suite).localeCompare(String(b.suite), undefined, { numeric: true }) || bySort(a, b));
  buildingsHTML += `<section class="bldg"><h2>${esc(name)}</h2>
    ${wide.length ? `<h3>Entry &amp; common areas</h3>${areaTable(wide, "Location")}` : ""}
    ${suites.length ? `<h3>Suites</h3>${suiteTable(suites)}` : ""}
  </section>`;
}

const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sanctuary Office Park — Access Instructions</title>
<style>
  :root{--navy:#22315d;--blue:#5e8ed0;--ink:#1f2937;--mute:#94a3b8;--line:#e2e8f0;--bg:#f6f8fb;}
  *{box-sizing:border-box;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;color:var(--ink);margin:0;background:var(--bg);}
  .wrap{max-width:980px;margin:0 auto;padding:28px 22px 60px;}
  header{border-bottom:3px solid var(--navy);padding-bottom:14px;margin-bottom:8px;}
  h1{font-size:25px;color:var(--navy);margin:0 0 2px;}
  .sub{color:#475569;font-size:13px;}
  .warn{background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;color:#991b1b;border-radius:9px;padding:11px 14px;font-size:12.5px;line-height:1.55;margin:16px 0;}
  .policy{background:#eef4fb;border:1px solid #d6e3f4;border-left:4px solid var(--blue);border-radius:9px;padding:12px 15px;margin:14px 0 22px;}
  .policy h3{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--navy);}
  .policy div{font-size:13px;color:#334155;line-height:1.7;}
  section.bldg{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px;box-shadow:0 1px 3px rgba(15,23,42,.05);}
  section.bldg h2{font-size:18px;color:var(--navy);margin:0 0 4px;border-bottom:2px solid var(--blue);padding-bottom:7px;}
  section.bldg h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);margin:16px 0 7px;}
  table.rep{border-collapse:collapse;width:100%;font-size:12.5px;margin-bottom:4px;}
  table.rep th{background:var(--navy);color:#fff;text-align:left;font-weight:600;padding:6px 10px;font-size:11px;letter-spacing:.02em;}
  table.rep th:first-child{border-top-left-radius:7px;}table.rep th:last-child{border-top-right-radius:7px;}
  table.rep td{border-bottom:1px solid var(--line);padding:7px 10px;vertical-align:top;}
  table.rep tr:nth-child(even) td{background:#fafcff;}
  .c-suite{font-weight:700;color:var(--navy);white-space:nowrap;}
  .c-tenant{color:#334155;}
  .c-area{font-weight:600;color:#334155;}
  .lvl{display:inline-block;font-size:9.5px;font-weight:700;color:#fff;background:var(--blue);border-radius:4px;padding:1px 5px;vertical-align:middle;}
  .method{display:inline-block;font-size:10px;font-weight:600;color:var(--navy);background:#e8eefb;border-radius:5px;padding:1px 7px;}
  .m-noaccess{color:#991b1b;background:#fee2e2;}.m-unlocked{color:#475569;background:#eef2f7;}.m-alarm{color:#92400e;background:#fef3c7;}
  .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;color:#0f172a;background:#eef2f7;border:1px solid #dbe3ec;border-radius:5px;padding:1px 7px;font-size:12px;}
  .key{color:#475569;font-size:11.5px;margin-top:3px;}
  .notes{font-size:11.5px;color:#475569;line-height:1.5;}
  .notes.sensitive{color:#7c2d12;}
  .sens{font-size:8.5px;font-weight:700;color:#b91c1c;background:#fee2e2;border-radius:4px;padding:1px 5px;text-transform:uppercase;letter-spacing:.03em;}
  .muted{color:#cbd5e1;}
  footer{margin-top:22px;color:var(--mute);font-size:11px;text-align:center;line-height:1.6;}
  @media print{body{background:#fff;}section.bldg{box-shadow:none;break-inside:avoid;}.wrap{padding:0;}table.rep th{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style></head><body><div class="wrap">
<header>
  <h1>Sanctuary Office Park — Access Instructions</h1>
  <div class="sub">#1 Sanctuary Blvd, Mandeville, LA 70471 &middot; ${rows.length} access points &middot; generated ${generated}</div>
</header>
<div class="warn"><strong>Confidential — physical security.</strong> This document lists door codes, alarm codes, alarm-bypass passwords and key locations. Share only with authorized staff. Always lock the front doors on the way out of each building.</div>
${policy.length ? `<div class="policy"><h3>Campus-wide</h3><div>${policy.map((a) => `<b>${esc(a.label)}:</b> ${esc(a.notes || "")}`).join("<br>")}</div></div>` : ""}
${buildingsHTML}
${clubhouse.length ? `<section class="bldg"><h2>Clubhouse</h2>${areaTable(clubhouse, "Location")}</section>` : ""}
<footer>Crosby Development &middot; generated from the dashboard access-instructions data on ${generated}.<br>Keep this document secure and discard printed copies appropriately.</footer>
</div></body></html>`;

writeFileSync(OUT, html);
console.log(`Wrote access report (${rows.length} points) -> ${OUT}`);
