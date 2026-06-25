# Fraktalex — Reporting collection system · setup

Three files:

| File | Where it lives | Purpose |
|---|---|---|
| `Code.gs` | Google Apps Script | backend: stores data in Google Sheets, sends emails |
| `admin.html` | GitHub Pages | admin panel |
| `employee.html` | GitHub Pages | employee page |

The "Excel table on Google Drive" is the Google Sheet itself (the **Entries** tab). Export to `.xlsx`: in the sheet, **File → Download → Microsoft Excel**.

---

## Step 1. Backend (Google)

1. Create a Google Sheet — it becomes the storage.
2. In the sheet: **Extensions → Apps Script**. Delete the boilerplate and paste all of `Code.gs`.
3. In the `CONFIG` block at the top, set:
   - `ADMIN_PASSCODE` — a long random admin PIN (don't share it).
   - `EMPLOYEE_BASE_URL` — link to the employee page (after Step 2, format: `https://USERNAME.github.io/REPO/employee.html`).
   - `ADMIN_BASE_URL` — link to the admin panel (used in the "report ready" email button).
   - `ADMIN_EMAIL` — address that receives "report ready" notifications. If empty, the script owner's address is used.
   - `SHEET_ID` — can stay empty if the script is opened from the sheet itself.
4. (Optional) run the `setup` function once to create the tabs. They are also created on first request.
5. **Deploy → New deployment → type "Web app"**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Approve the Gmail/Sheets permissions (needed to send mail and write to the sheet).
7. Copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).

Check: open that URL in a browser — it should return `{"ok":true,"service":"fraktalex-reports",...}`.

> After any code change you must **Deploy → Manage deployments → ✏️ → New version**, otherwise the changes won't apply.

---

## Step 2. Frontend (GitHub Pages)

1. In `admin.html` and `employee.html`, replace `PASTE_YOUR_WEB_APP_URL_HERE` with the Web app URL from Step 1.
2. Upload both files to a GitHub repository.
3. **Settings → Pages → Source: Deploy from branch**, branch `main`, folder `/root`. Save.
4. After a minute the pages are live:
   - admin: `https://USERNAME.github.io/REPO/admin.html`
   - employee: `https://USERNAME.github.io/REPO/employee.html`
5. Go back to Apps Script, fill in `EMPLOYEE_BASE_URL` and `ADMIN_BASE_URL`, and publish a new deployment version.

---

## Step 3. How to use

**Administrator** (`admin.html`):
1. Sign in with the PIN.
2. **Employees** → add people: full name, email, rate, currency. (Re-adding the same email updates the record.)
3. **Projects** → create a project: name, customer, employee, comment. That's it — rate and currency come from the employee's record.
4. Next to each project — the **Release** button: the task becomes available to the employee and they get an email. Until released, the employee can't see it.
5. **Recall** takes the task back — it becomes unavailable to the employee (any draft is preserved; on the next release they continue from it).
6. When the employee submits, the status becomes "Submitted", you get an email, and the **Report** button shows the activities and totals. A per-report summary also appears in **Collected data**.

**Employee** (`employee.html`):
1. Open the link from the email → enter your email. You only see projects released to you.
2. The list shows: project, customer, rate, comment, status (new / draft / submitted).
3. Open a report, list the **activities** (one description each) and enter the **total hours** spent on all activities. The header shows live: rate, total hours, and the amount (hours × rate).
4. **Save draft** — you can return to a report many times across sessions. **Submit report** — the report goes to the administrator (who receives an email).

---

## Workflow (task statuses)

`Created` (admin only) → **Release** → `Released` (visible to employee, email sent) → employee saves `Draft` → **Submit** → `Submitted` (email to admin).
At any time before submission the admin can **Recall** → back to `Created`, unavailable to the employee.

---

## Security notes

- The **employee** "authenticates" only by email — intentionally simple, as specified. Anyone who knows someone's email can see their tasks. If you need it stricter, I can add a one-time token in the email link (magic-link).
- The **admin** is protected by a PIN, checked by the server on every action. Use a long PIN and don't publish `Code.gs` with a real PIN in a public repository.
- The "Anyone" deployment is required so static pages can reach the API. Actions are still protected: admin ones by the PIN, employee ones by email + task-status checks on the server.

## Troubleshooting

- **Emails not arriving** → check Spam; make sure you granted the Gmail permission during deployment. Gmail limit is ~100 emails/day on a regular account.
- **"The string did not match the expected pattern" / non-JSON / CORS** → the endpoint must be open to "Anyone" and the URL must end with `/exec` (not `/dev`). Open the `/exec` URL directly: it should return JSON, not a Google sign-in page.
- **Code changes not visible** → publish a new deployment version.
- **"APPS_SCRIPT_URL is not configured"** → you didn't replace `PASTE_...` in the HTML.

## Data model (sheet tabs)

- **Employees**: directory — full name, email, rate, currency.
- **Projects**: one report task per employee — name, customer, employee, currency, rate, comment, status, and (once submitted) reported hours and amount. This is the per-report summary table.
- **Entries**: activity detail — one row per activity (description) of a report.

> If you deployed an earlier version, delete the **Projects**, **Employees**, **Entries** (and **Assignments**, if present) tabs in the sheet. They will be recreated with the new columns on first request.
