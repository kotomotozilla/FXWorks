# Fraktalex — Reporting collection system · setup

Three files:

| File | Where it lives | Purpose |
|---|---|---|
| `Code.gs` | Google Apps Script | backend: stores data in Google Sheets, sends emails |
| `admin.html` | GitHub Pages | admin panel |
| `employee.html` | GitHub Pages | employee page |

The "Excel table on Google Drive" is the Google Sheet itself. Export to `.xlsx`: in the sheet, **File → Download → Microsoft Excel**.

---

## Step 1. Backend (Google)

1. Create a Google Sheet — it becomes the storage.
2. In the sheet: **Extensions → Apps Script**. Delete the boilerplate and paste all of `Code.gs`.
3. In the `CONFIG` block at the top, set:
   - `ADMIN_PASSCODE` — a long random admin PIN (don't share it).
   - `EMPLOYEE_BASE_URL` — link to the employee page (after Step 2: `https://USERNAME.github.io/REPO/employee.html`).
   - `ADMIN_BASE_URL` — link to the admin panel (used in the "report ready" email button).
   - `ADMIN_EMAIL` — address that receives "report ready" notifications (recommended to set explicitly).
   - `SHEET_ID` — can stay empty if the script is opened from the sheet itself.
4. **Deploy → New deployment → type "Web app"**: Execute as **Me**, Who has access **Anyone**. Approve the Gmail/Sheets permissions.
5. Copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).

Check: open that URL in a browser — it should return `{"ok":true,"service":"fraktalex-reports",...}`.

> After any code change you must **Deploy → Manage deployments → ✏️ → New version**, otherwise the changes won't apply.
> The backend self-heals sheet structure: if a tab has an outdated header row, it is renamed to `<Tab>_old_<timestamp>` and a fresh one is created (no data is destroyed).

---

## Step 2. Frontend (GitHub Pages)

1. In `admin.html` and `employee.html`, replace `PASTE_YOUR_WEB_APP_URL_HERE` with the Web app URL from Step 1.
2. Upload both files to a GitHub repository.
3. **Settings → Pages → Source: Deploy from branch**, branch `main`, folder `/root`. Save.
4. After a minute the pages are live (`.../admin.html`, `.../employee.html`).
5. Back in Apps Script, fill in `EMPLOYEE_BASE_URL` and `ADMIN_BASE_URL`, and publish a new deployment version.

---

## Step 3. How to use

**Administrator** (`admin.html`):
1. Sign in with the PIN.
2. **Employees** → add people: full name, email, rate, currency, and a **password** (the employee signs in with email + password). Re-adding the same email updates the record; leave password blank to keep the old one.
3. **Projects** → create a project with just **name** and **customer**.
4. Open the project (**Open**) to manage it:
   - **Add employee**: pick from the directory + a comment, then **Add & notify** — the employee is assigned and emailed. You can add several employees.
   - Edit each employee's **comment** and **Save comment** — if the comment changed, that employee is emailed again. Unchanged employees are not emailed.
   - **Report / edit** opens the report: edit activities and total hours, then **Save** (keeps the status) or **Save & submit** (marks it submitted — it becomes read-only for the employee). The admin can edit a report at any status, including submitted.
   - **Download PDF** — generate a PDF of the report; tick the checkbox first to add a signature field at the bottom (employee name + signature line).
   - Status button: **Recall** (not submitted → unavailable to the employee, draft kept) / **Send back for correction** (submitted → editable again + the employee is emailed) / **Release again** (recalled → re-notify).
   - **Delete** removes one employee's report; **Delete project** removes the whole project with all reports.
   - Edit **project name / customer** and **Save project**.
5. When an employee submits, the status becomes "Submitted" and you receive an email. A per-report summary is in **Collected data**.

**Employee** (`employee.html`):
1. Open the link from the email → enter **email + password**. You only see reports assigned to you (not recalled).
2. Open a report, list the **activities** (one description each) and enter the **total hours** for all activities. The header shows rate, total hours, and amount (hours × rate).
3. **Save draft** — return to it across sessions. **Submit report** — it goes to the admin (who is emailed).
4. After submission the report is **read-only**. If the admin sends it back for correction, you can edit and submit it again.

---

## Notifications (when employees are emailed)

An employee is emailed only when they are **added** to a project, or when their **comment is changed**. Other employees on the project are not disturbed.

---

## Security notes

- Employees sign in with **email + password** set by the admin. Passwords are stored as plain text in the private **Employees** sheet — fine for a simple internal tool, but don't reuse important passwords. (Can be upgraded to hashed passwords on request.)
- The **admin** is protected by a PIN, checked on every action. Use a long PIN; don't publish `Code.gs` with a real PIN in a public repo.
- The "Anyone" deployment is required so static pages can reach the API. Admin actions are gated by the PIN; employee actions by email + password + status checks.

## Troubleshooting

- **Emails not arriving** → check Spam; grant the Gmail permission during deployment. Gmail limit ≈100 emails/day.
- **"did not match the expected pattern" / non-JSON / CORS** → the `/exec` URL must be open to "Anyone". Open it directly: it should return JSON, not a Google sign-in page.
- **Submit error about `Session.getEffectiveUser`** → set `ADMIN_EMAIL` in `CONFIG` and publish a new version.
- **Code changes not visible** → publish a new deployment version.

## Data model (sheet tabs)

- **Employees**: full name, email, rate, currency, password.
- **Projects**: name, customer (one row per project).
- **Assignments**: one row per (project × employee) — employee, rate/currency, comment, status, and (once submitted) reported hours and amount.
- **Entries**: activity detail — one row per activity of a report.

> Upgrading from an earlier version: if a tab's columns differ from what the code expects, the backend **migrates the data in place** — it remaps existing rows by column name, adds new columns (blank), and keeps any extra old columns. No data is lost, so you don't need to delete or recreate tabs.
