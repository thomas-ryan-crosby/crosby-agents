/**
 * Crosby Development — Lease-scan intake
 * Auto-saves PDFs emailed by the office copier into a Google Drive folder so they
 * can be processed into the Sanctuary / Crosby dashboard.
 *
 * One-time setup:
 *   1. Go to https://script.google.com  →  New project.
 *   2. Replace the default code with this whole file. (Rename the project, e.g. "Lease Scan Intake".)
 *   3. Adjust the CONFIG block below if you want a different folder/sender/interval.
 *   4. In the editor's function dropdown choose `setup`, click Run, and approve the
 *      Gmail + Drive permissions when prompted.
 *   That's it — it now runs automatically and saves new copier PDFs to the Drive folder.
 *
 * What it does each run:
 *   - Finds copier emails (from SENDER) with PDF attachments that it hasn't saved yet.
 *   - Saves each PDF into the DRIVE_FOLDER (created automatically if missing).
 *   - Labels those emails PROCESSED_LABEL so they're never saved twice.
 */

// ==================== CONFIG ====================
var SENDER          = 'crosbycopier1@gmail.com'; // the office copier's Gmail address
var DRIVE_FOLDER    = 'Lease Scans';             // Drive folder to drop scans into
var PROCESSED_LABEL = 'Saved-to-Drive';          // Gmail label applied after saving
var LOOKBACK_DAYS   = 30;                         // only scan mail this recent
var RUN_EVERY_MIN   = 10;                         // how often the trigger runs
// ================================================

function saveCopierScans() {
  var folder = getOrCreateFolder_(DRIVE_FOLDER);
  var label  = getOrCreateLabel_(PROCESSED_LABEL);

  var query = 'from:' + SENDER + ' has:attachment -label:' + PROCESSED_LABEL +
              ' newer_than:' + LOOKBACK_DAYS + 'd';
  var threads = GmailApp.search(query, 0, 50);
  var saved = 0;

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (att) {
        var name = att.getName() || ('scan-' + msg.getId() + '.pdf');
        var isPdf = att.getContentType() === 'application/pdf' || /\.pdf$/i.test(name);
        if (isPdf && !folder.getFilesByName(name).hasNext()) {
          folder.createFile(att.copyBlob()).setName(name);
          saved++;
        }
      });
    });
    thread.addLabel(label); // mark processed so we never re-save it
  });

  console.log('Lease-scan intake: saved ' + saved + ' new PDF(s) to "' + DRIVE_FOLDER + '".');
  return saved;
}

// ---- helpers ----
function getOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// Run ONCE to authorize, create the recurring trigger, and do a first pass.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'saveCopierScans') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('saveCopierScans').timeBased().everyMinutes(RUN_EVERY_MIN).create();
  var n = saveCopierScans();
  console.log('Setup complete. Trigger runs every ' + RUN_EVERY_MIN + ' min. First pass saved ' + n + ' file(s).');
}
