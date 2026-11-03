# v0.11 — team use, versions, notifications, scheduling, forms, approvals, dashboards, phones

## 1. Several people at once
- **Office network.** Run `npm run office` on one always-on computer. It asks for an access code (6+ characters) and prints the address to share, for example `http://192.168.1.20:4317`.
  - Other computers enter the code once; it is remembered for 30 days. The computer running Sheets never needs it.
  - Changing the code signs everyone out.
- **Live updates.** Saved changes appear in everyone's open window within about a second, without reloading.
- **Presence.** Badges show who else is on the sheet, and a marker shows which row and cell they are on.
- **One server at a time.** A lock file next to the database names the computer running Sheets.
  - A second copy, on this computer or another one through Dropbox, refuses to start and says where Sheets is already running.
  - If another computer takes over anyway, this one stops saving rather than risk your data.
  - `SHEETS_FORCE_START=1` overrides the lock. Only use it if the other computer is definitely stopped.

## 2. Versions & backups
More tools → File → **Versions & backups**.
- **Named versions** are snapshots of the whole workspace, kept until you delete them.
- **Automatic backups** run once a day while the app is open. They are kept for 14 days, then one per week for 8 weeks.
- Files are stored in `backups/versions`, compressed (about 2 MB each).
- **Compare** shows the changed cells and the added or deleted rows in a sheet.
- **Restore** works one sheet at a time, so it never touches newer work in other sheets:
  - **As a copy** next to the current sheet.
  - **Replace the current sheet.** A safety version is saved first, and Undo reverses it.

## 3. Email notifications
- Each person in **People & notifications** can have an email address and choose what they get: mentions, requests and approvals, watched rows, reminders and automations, and a daily digest.
- **Watch** (in the row panel) emails you when someone else changes that row.
- **Daily digest:** unread items, sent at 7 am by default (`SHEETS_DIGEST_HOUR`).
- Email needs your mail server details when Sheets starts. Nothing is stored in the workspace. For example, with Microsoft 365:
  ```bash
  SMTP_HOST=smtp.office365.com SMTP_PORT=587 SMTP_USER=sheets@yourcompany.com \
  SMTP_PASS='app password' SMTP_FROM='Sheets <sheets@yourcompany.com>' \
  SHEETS_APP_URL=http://192.168.1.20:4317 npm run office
  ```
- "Send test" on the People screen checks the setup.
- Without these settings, notifications still appear in each person's Inbox.

## 4. Gantt: dependencies, critical path, baseline
- **Arrows** for FS, SS, FF and SF links.
- **Critical path** in black, with the project finish date.
- **Slack:** tasks that can slip are shown in white.
- **Baseline** bars, with "+N days" where a task is later than planned.
- A **today** line.
- **Auto-schedule** (Dependencies & schedule → "Reschedule automatically"): changing a date, duration or predecessor moves every later task. It uses working days and holidays, and phase rows span their tasks.
- Scheduling problems, such as a circular dependency, are shown on the chart and never block your edit.
- New formulas: `ISCRITICAL()` and `TOTALFLOAT()`.

## 5. Smartsheet formulas
Added: AVGW, STDEVS, STDEVP, STDEVA, STDEVPA, RANKEQ, RANKAVG, PERCENTILE, WEEKNUMBER, YEARDAY, ISDATE, ISBOOLEAN, UNICHAR, TIME, DURATION, NPV, IRR, NETWORKDAY, ISCRITICAL and TOTALFLOAT. The Smartsheet import report lists any function that is still missing.

## 6. Shareable forms
- Each form has its own page (**Copy link** / **Open page**) that works well on phones.
- **Show only when:** a question can appear only after an earlier answer, for example Severity only when Type is Damage.
- **Photos and files:** up to 5 files of 2 MB each. Larger photos are shrunk automatically.
- The person's **name** is optional and is recorded as a comment on the new row.
- **Public link** (optional): works on the office network without the access code, and shows nothing but that form.
- Every answer is checked on the server: types, dropdown choices and required questions.

## 7. Approvals
- Right-click a row → **Request approval…**, or use the new **Approvals** tab in the row panel.
- Approvers approve or decline right there, with a note. One decline declines the request; approval needs every approver.
- Every request and decision is recorded in the row's **History**.

## 8. Dashboards
- **Add chart or total:** bar, line (by month), donut, or a big-number total from any sheet.
- Options: group by a column, count / sum / average / min / max, a row filter, and number formats.
- Charts update live as people edit.
- **TV mode** hides everything except the dashboard and shows a live clock, for an office screen.

## 9. Faster saves
- An edit now reuses every sheet and row it didn't touch, instead of re-reading and re-checking the whole workspace.
- Budget edits: server time went from about 310 ms to about 145 ms, and about 0.2 s from Enter to saved.
- Checked over a 13-step edit sequence on the full 33 MB workspace: the result is byte-identical to the old method, and Undo restores the original exactly.
- Workspaces with automatic DataTable connections keep the old method.

## 10. Phones and tablets
- On a phone, rows show as cards. Tapping one opens it full screen, and the menu moves to a bottom bar.
- The new **Details** tab edits a row's fields in the side panel, on phone and desktop.
- **Take or choose a photo** opens the phone camera. Photos over 2 MB are resized automatically, for example a 14 MB photo becomes 1.3 MB.

## 11. Automatic imports from a folder
More tools → Data → **Automatic import from a folder**.
- Any CSV or Excel file saved in the folder (for example a Dropbox folder that accounting exports to) is imported within a minute.
- File columns are matched to sheet columns by name.
- Existing rows are updated by a matching column, or every row can be added as new.
- Locked rows are skipped.
- Ignored columns and invalid values are listed under each import.
- Processed files move to a `processed` subfolder.
- Only the computer running Sheets can set this up, and only for folders inside your home folder.
- Importing from an email inbox is not included.

## 12. Images and previews
- The first photo on a row shows as a thumbnail in the grid.
- The Files tab shows thumbnails; click to preview. PDFs open in a new tab.

## Tests
`npm test`: 280 passing. New suites cover:
- the lock and access checks, versions, notifications and the SMTP client (with a fake mail server);
- the Gantt and critical path, Smartsheet functions, forms, approvals, dashboard widgets and folder imports;
- the save fast path.

Every feature was also tested in the browser on a copy of the full workspace, including the 11,444-row budget.
