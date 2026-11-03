# v0.12: fixes and hardening

Findings from a review of v0.11, plus problems found by using the app on a copy of the full workspace.

## Data and storage
- **Smaller database.** Older undo steps were stored as full copies of the workspace (~16 MB each). On first start they are converted into "what changed" patches. Each step is checked before anything is written; if any check fails, nothing is changed. Unused space is then given back. The real workspace goes from 590 MB to about 68 MB, so backups and Dropbox sync are much smaller. All 31 undo steps were checked to restore exactly the same workspace as before.
- **Lock respected everywhere.** If another computer takes over the database, this one stops all background writes: email, folder imports, automatic backups and scheduled automations.
- **Saves never change cached rows in place.** Date automations, approvals and new automatic connections copy a row before writing to it, so live updates, undo and what is on disk always agree.
- **Undo after automated changes.** After a form submission, folder import or automation, Undo still reverses your own last change, as long as nobody changed the same cells.

## Scheduling
- **Predecessor row numbers follow their rows** when rows are inserted, deleted or moved, as in Smartsheet. A reference to a deleted row is dropped.
- **Critical path.** Fixed for start-to-start and start-to-finish links; every task is capped at the project finish.

## Folder imports
- **Transient failures are retried** up to 3 times: Python missing, a lock, a conflict or a timeout. Before, the file was skipped for good.
- **"Always add new rows" needs files moved to "processed".** Otherwise every change to a file would add all its rows again. Existing imports set up that way are paused, with a note.
- **Rows with no key value are skipped** in "match on a column" mode, with a note, instead of being added again on every run.

## Office network and email
- Sheets only answers to this computer's own names and addresses. More names can be added with `SHEETS_ALLOWED_HOSTS`. This blocks DNS-rebinding web pages.
- Five wrong access codes from one address within 10 minutes pause that address for 15 minutes.
- **Form uploads.** A form response is limited to about 15 MB. Files are refused when the workspace is nearly full (56 MB), so form uploads can't push it past the 64 MB limit.
- **Email security.** The email password is never sent over an unencrypted connection. For a trusted local relay, set `SMTP_ALLOW_PLAIN=1`.

## Screens
- **Sheet search.** Switching sheets clears it, the active term shows on the toolbar with a "Clear search" button, and typing is smooth on the 11,444-row budget.
- **Reload crash fixed.** Reloading a dashboard with a Total tile no longer crashes.
- **Phones:**
  - long sheets scroll;
  - the Workspace button opens full-screen navigation (sheets, dashboards, forms, reports);
  - thumbnails are small copies instead of the full photo.
- **Live updates:**
  - they no longer wipe what you are typing in the row panel; a "changed by someone else — Reload row" note appears instead;
  - saving Details sends only the fields you changed;
  - search boxes and open dropdowns keep focus;
  - a coworker's save arriving during your own save is no longer missed.
- **Dashboards:**
  - deleting a column or sheet used by a chart removes or adjusts those charts;
  - a chart pointing at something deleted shows a note instead of blocking saves;
  - the chart dialog updates its column lists when you change the sheet.
- **Forms:**
  - conditions on a checkbox question accept Yes/No, and the builder offers the right choices for each question;
  - "Open page" works in Safari.
- **People:**
  - people can be removed;
  - new email addresses are checked;
  - Enter in the test-email field sends a test.
- **Smaller fixes:**
  - Enter saves the Details tab;
  - the TV clock stays visible;
  - folder-import fields are kept when the dialog refreshes;
  - photo shrinking keeps transparency and leaves GIFs alone.
