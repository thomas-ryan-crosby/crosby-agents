// Builds data/access-instructions.json from the "Access Info - Crosby Office
// Buildings" PDF (Sanctuary Office Park door/alarm/key access instructions).
//
// One row per access point. Suite rows join to the dashboard roster by
// buildingId + suite; non-suite rows (exterior doors, alarms, restrooms,
// storage, common areas) surface at the building level. Clubhouse + campus
// policy rows are property-level.
//
//   node scripts/build-access-instructions.mjs
//
// ⚠ These are physical-security codes (incl. an alarm-company bypass password).
// The dashboard Firestore is currently public-read, so seeding this publishes
// the codes. This was an explicit, informed choice by the operator.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "access-instructions.json");
const PROP = "sanctuary-office-park";
const BID = (n) => `sanctuary-bldg-${n}`;

// e(building#, level, area, suite, tenant, label, method, code, altCode, keyDescription, notes, sensitive)
let order = 0;
function e(b, level, area, suite, tenant, label, method, code, altCode, keyDescription, notes, sensitive) {
  order += 10;
  const buildingId = b == null ? null : BID(b);
  const building = b == null ? (area === "clubhouse" ? "Clubhouse" : null) : `Building #${b}`;
  const idBase = b == null ? (area === "clubhouse" ? "clubhouse" : "policy")
    : `b${b}` + (suite ? `-${String(suite).toLowerCase().replace(/[^a-z0-9]+/g, "")}` : `-l${level ?? "x"}`);
  return {
    id: `access-${idBase}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`,
    propertyId: PROP, buildingId, building, level: level ?? null,
    area, suite: suite || null, tenant: tenant || null, label,
    method: method || null, code: code || null, altCode: altCode || null,
    keyDescription: keyDescription || null, notes: notes || null,
    sensitive: !!sensitive, sortOrder: order,
  };
}

const rows = [
  // ── Campus-wide policy ──
  e(null, null, "policy", null, null, "Key storage", null, null, null, null,
    "All keys are kept in Tommy Crosby's office inside the cabinet.", false),
  e(null, null, "policy", null, null, "Lock front doors", null, null, null, null,
    "ALWAYS lock the front doors on the way out of each building.", false),

  // ── Building 1 ──
  e(1, 1, "exterior", null, null, "Front door", "key", null, null, "purple cover", null, false),
  e(1, 1, "exterior", null, null, "Back door (by garage)", "keypad", "12251", null, null, null, false),
  e(1, 1, "common", null, null, "Front room by Beverly's desk (lobby)", "keypad", "1225", null, null, null, false),
  e(1, 1, "storage", null, null, "Storage closet (left of front door / left of bathroom)", "keypad", "1225", null, null, null, false),
  e(1, 1, "common", null, null, "Garage-to-office door", "unlocked", null, null, null,
    "The door to the office area from inside the garage remains unlocked at all times.", false),
  e(1, 2, "suite", null, "Maricle & Associates Law", "Main office area door (right of elevator)", "scan-card", null, null,
    "scan card on keychain", "Empty trash in the Maricle suite each weekday (Mon-Fri).", false),
  e(1, 3, "suite", "301A", "Nirvana Massage Therapy", "Suite 301A", "keypad", "1225", null, null, null, false),
  e(1, 3, "suite", "301B", "Acorn Adoption", "Suite 301B", "key", null, null, 'key marked "301B" with white cover', null, false),
  e(1, 3, "suite", "300", "Conn Energy", "Suite 300", "key", null, null,
    'key marked "300 back" with red cover', "For the rear right door / last door in the hallway.", false),
  e(1, 3, "suite", "300A", "Mandeville Technology", "Suite 300A", "key", null, null,
    "key with green cover", "For the 3rd door on the left.", false),
  e(1, 3, "suite", "302", "Security National Life Insurance", "Suite 302", "key", null, null,
    "2 keys: blue cover + purple cover",
    "Blue-cover key opens the 1st and 2nd doors on the left; purple-cover key opens the 1st door on the right to the SNL war-room (past the men's restroom).", false),
  e(1, 3, "suite", "303", "Bayou CPR", "Suite 303", "keypad", "1225", null, null, null, false),
  e(1, 3, "suite", "305", "Skin Solutions (Jete Crosby)", "Suite 305", "key + keypad", "1305", null,
    'front door key marked "305" with hot pink cover', "Front door is a physical key; interior door keypad code is 1305.", false),
  e(1, 3, "suite", "306", "Nirvana Massage Therapy", "Suite 306", "keypad", "1313", "1225", null,
    "Front door key code 1313 and 1225.", false),

  // ── Building 2 ──
  e(2, null, "exterior", null, null, "Front door", "key", null, null, "dark green cover", null, false),
  e(2, 1, "alarm", null, "Wells Fargo", "Wells Fargo main office area (alarm)", "alarm", "1225", "1963", null,
    "Disarm: enter 1225 (or 1963) then CMD. Reset/arm: CMD then the top button second from left (ARM). Door to the Wells Fargo right-hand rear hallway: 1225 (or 1963) on the keypad. Wells Fargo is locking ~6 interior offices; the light-gray-cover key is a master that opens them all - please re-lock those office doors when finished cleaning.", true),
  e(2, 1, "restroom", null, null, "Men's bathroom", "keypad", "0713", null, null, null, false),
  e(2, 1, "restroom", null, null, "Women's bathroom", "keypad", "0615", null, null, null, false),
  e(2, 1, "common", null, "Wells Fargo", "Wells Fargo cage area", "keypad", "6273", null, null, null, true),
  e(2, 1, "common", null, null, "Rooms 2100 & 2104", "key", null, null,
    'key marked "2100" or "2014"', "Both keys are interchangeable; Tommy keeps one of them.", false),
  e(2, 1, "common", null, null, "Hallway kitchen", "keypad", "1225", null, null, null, false),
  e(2, 1, "suite", "100", "Standard Investment Advisors", "Suite 100", "key", null, null, "gray cover", null, false),
  e(2, 1, "suite", "102", "Central Title and Closing", "Suite 102", "key", null, null, "yellow cover", null, false),
  e(2, 2, "common", null, null, "Confidential keypad offices (Level 2)", "no-access", null, null, null,
    "We do not need to clean/enter the three confidential offices with keypads. Can leave Linda a sticky note on her office door or in the kitchen if necessary.", false),
  e(2, 2, "suite", "201", null, "Suite 201", "key", null, null, "golden key with orange ring-cover", null, false),
  e(2, 2, "suite", "202", "Chris Pazos", "Suite 202", "key", null, null, "solid orange cover",
    "When leaving, take a picture of the locked door.", false),
  e(2, 2, "suite", "203", null, "Suite 203", "key", null, null, "red cover", null, false),
  e(2, 2, "suite", "204", "Cypress Key Realty", "Suite 204", "key", null, null, "light blue cover", null, false),
  e(2, 2, "suite", "205", null, "Suite 205 front door", "key", null, null, "red cover", null, false),
  e(2, 2, "suite", "206", "Assured Partners", "Suite 206", "keypad", "1225", null, null, null, false),
  e(2, 3, "common", null, null, "Level 3 lobby door to 302A/B hallway", "unlocked", null, null, null,
    "Door on the left when entering the third-floor lobby (leading to the hallway where Suites 302A/B are). No key - left unlocked.", false),
  e(2, 3, "common", null, null, "Level 3 exam rooms (2nd & 3rd doors on left)", "key", null, null,
    'key marked "3" with dark blue cover', null, false),
  e(2, 3, "suite", "303", "EyeCare 20/20", "Suite 303", "key", null, null, "solid green cover", null, false),
  e(2, 3, "common", null, null, "Office next to 302B", "key + keypad", "1020", null,
    "key with dark blue cover", "Code 1020 and the dark-blue-cover key.", false),
  e(2, 3, "suite", "302A", null, "Suite 302A/B entry", "no-access", "1020", null, null,
    "Upon entering Suite 302A/B, Scott Riddell's office to the immediate left is confidential, always locked, with no access/cleaning by us (keycode 1020).", true),
  e(2, 3, "suite", "304", "Gary M. Thomas, CPA", "Suite 304", "key", null, null, "golden key with yellow cover",
    "Rooms behind doors on the right-hand side of the hallway and storage closets need not be cleaned.", false),
  e(2, 3, "suite", "301", "Hartford Bond", "Suite 301", "key", null, null, "solid blue cover", null, false),
  e(2, 3, "common", null, "Quest Diagnostics", "Quest Diagnostics room (Level 3)", "keypad", "1313", "3456", null, null, false),
  e(2, 3, "storage", null, null, "Level 3 storage room/closet", "keypad", "1225", null, null, null, false),
  e(2, 3, "suite", "302B", "Rose Mountain", "Suite 302B", "key", null, null, "light green cover", null, false),
  e(2, 3, "suite", "302C", "Body Remedy", "Suite 302C", "keypad", "1225", null, null, null, false),

  // ── Building 3 ──
  e(3, null, "exterior", null, null, "Front door", "key", null, null,
    'key with yellow cover, tagged "front door key"', null, false),
  e(3, 1, "suite", "101", "GJTBS", "Suite 101", "key", null, null, "green cover", null, false),
  e(3, 2, "alarm", "201", "Baker, Donelson, Bearman, Caldwell & Berkowitz", "Suite 201 alarm", "alarm", "5012", null, null,
    'If you accidentally set off the alarm, the monitoring agency will call the receptionist’s desk. You are authorized (by Baker Donelson via Miss Jean) to answer and give the password "SUNSHINE", which keeps the agency from calling the police.', true),
  e(3, 2, "suite", "201", "Baker, Donelson, Bearman, Caldwell & Berkowitz", "Suite 201 front door", "key", null, null,
    'key marked "2nd" with orange cover', "Do NOT empty the blue recyclable receptacles on the second floor (in-house program). Stay out of the server room - no access granted.", false),
  e(3, 3, "suite", "301", "Galloway, Johnson, Tompkins, Burr & Smith", "Suite 301", "key", null, null, "dark green cover", null, false),

  // ── Building 4 ──
  e(4, null, "exterior", null, null, "Front door", "key", null, null, "bright yellow key next to a blue tag", null, false),
  e(4, 1, "storage", null, null, "Lobby storage room", "keypad", "1254", null, null, null, false),
  e(4, 1, "suite", null, "Offender Watch", "Level 1 front glass door (Offender Watch)", "fob + keypad", "1225", null,
    "gray fob", "Gray fob plus 1225 on the keypad to unlock the deadbolt.", false),
  e(4, 1, "alarm", null, "Offender Watch", "Level 1 alarm", "alarm", "1225", null, null,
    "Located by the front door: 1225 ENTER. Press 1225 AWAY when exiting; press 1225 to lock the deadbolt on leaving. The 1st and 2nd floor alarms are interconnected - arming/disarming one does both.", true),
  e(4, 2, "suite", null, "Offender Watch", "Level 2 front glass door (Offender Watch)", "fob + keypad", "1225", null,
    "gray fob", "Gray fob plus 1225 on the keypad to unlock the deadbolt.", false),
  e(4, 2, "alarm", null, "Offender Watch", "Level 2 alarm", "alarm", "1225", null, null,
    "Located by the front door: 1225 ENTER. Press 1225 AWAY when exiting. The 1st and 2nd floor alarms are interconnected - arming/disarming one does both.", true),
  e(4, 2, "suite", "200", "Edelman Financial Engines", "Suite 200", "key", null, null, "dark gray cover", null, false),
  e(4, 3, "storage", null, null, "Lobby storage closet (Level 3)", "keypad", "1225", null, null, null, false),
  e(4, 3, "suite", "300", null, "Suite 300", "keypad", "1313", null, null, "Paneled door in the corner.", false),
  e(4, 3, "suite", "302", null, "Suite 302", "key", null, null, "dark blue cover", null, false),
  e(4, 3, "suite", "304", "Menard Group", "Suite 304 offices front door", "key", null, null, "yellow cover", null, false),
  e(4, 3, "suite", "304", "Menard Group", "Suite 304 3rd-level kitchen", "key", null, null,
    'key marked "KIT" with purple cover', null, false),
  e(4, 3, "suite", "305", "Lain St. Paul", "Suite 305", "key", null, null, 'key marked "305" with solid orange cover', null, false),
  e(4, 3, "suite", "306", "JCM II LLC", "Suite 306", "keypad", "1225", null, null,
    'Listed as "JMC II" in the source; reconciled to JCM II LLC.', false),

  // ── Building 5 ──
  e(5, 1, "exterior", null, null, "Front door", "key", null, null, 'key marked "FD" with orange cover', null, false),
  e(5, 1, "suite", "103", "MAPS", "Suite 103", "key", null, null, "green key", "Offices to the left.", false),
  e(5, 1, "suite", "101", "Monson Law Firm", "Suite 101", "scan-card", null, null, null,
    "No alarm. Stay out of the server room - it remains locked, no access granted.", false),
  e(5, 2, "suite", "201", "CECO Construction", "Suite 201", "keypad", "1225", null, null, null, false),
  e(5, 2, "suite", "202", "Monson Law Firm", "Suite 202", "scan-card", null, null, null, null, false),
  e(5, 2, "suite", "203", "MedSouth", "Suite 203", "key", null, null, 'key marked "203" with solid yellow cover', null, false),
  e(5, 3, "suite", null, "Audubon Engineering", "Audubon Engineering (Level 3)", "scan-card", null, null, null, null, false),

  // ── Clubhouse ──
  e(null, null, "clubhouse", null, null, "Women's bathroom", "keypad", "2114", null, null, null, false),
  e(null, null, "clubhouse", null, null, "Men's bathroom", "keypad", "2115", null, null, null, false),
  e(null, null, "clubhouse", null, null, "Trash can enclosure", "combination", "1914", null, "combination lock", null, false),
  e(null, null, "clubhouse", null, null, "Pool gate", "keypad", "C173X", null, null, null, false),
];

writeFileSync(OUT, JSON.stringify(rows, null, 2) + "\n");
console.log(`Wrote ${rows.length} access-instruction rows -> ${OUT}`);
