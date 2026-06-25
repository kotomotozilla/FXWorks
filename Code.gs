/**
 * Fraktalex — Reporting collection system
 * Backend: Google Apps Script (Web App) + Google Sheets as storage.
 * Deployment: see SETUP.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — fill in before deployment
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  ADMIN_PASSCODE: 'CHANGE-ME-admin-pin',
  EMPLOYEE_BASE_URL: 'https://USERNAME.github.io/REPO/employee.html',
  ADMIN_BASE_URL:    'https://USERNAME.github.io/REPO/admin.html',
  // Admin email for "report ready" notifications. If empty — the script owner's address is used.
  ADMIN_EMAIL: '',
  SHEET_ID: '',
  COMPANY_NAME: 'Fraktalex Limited'
};

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { employees: 'Employees', projects: 'Projects', entries: 'Entries' };

const HEADERS = {
  employees: ['Email', 'FullName', 'Rate', 'Currency', 'CreatedAt'],
  projects:  ['ProjectID', 'Name', 'Customer', 'EmployeeEmail', 'EmployeeName', 'Currency', 'Rate',
              'Comment', 'Status', 'ReportedHours', 'ReportedAmount', 'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt'],
  entries:   ['EntryID', 'ProjectID', 'ProjectName', 'EmployeeEmail', 'ActivityDescription', 'CreatedAt']
};

const CURRENCIES = ['USD', 'EUR'];
// Statuses: created (hidden from employee) -> released -> draft -> submitted

// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') return jsonOut_({ ok: true, service: 'fraktalex-reports', time: new Date().toISOString() }, e);
  try { return jsonOut_(route_(action, e.parameter || {}), e); }
  catch (err) { return jsonOut_({ ok: false, error: String(err && err.message || err) }, e); }
}
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    return jsonOut_(route_(body.action, body), e);
  } catch (err) { return jsonOut_({ ok: false, error: String(err && err.message || err) }, e); }
}

function route_(action, d) {
  switch (action) {
    case 'admin_login':         requireAdmin_(d); return { ok: true };
    // Employees
    case 'create_employee':     return adminCreateEmployee_(d);
    case 'list_employees':      requireAdmin_(d); return { ok: true, employees: readAll_(SHEETS.employees) };
    case 'delete_employee':     return adminDeleteEmployee_(d);
    // Projects (a project = a report task for one employee)
    case 'create_project':      return adminCreateProject_(d);
    case 'list_projects':       requireAdmin_(d); return { ok: true, projects: readAll_(SHEETS.projects) };
    case 'release':             return adminRelease_(d);
    case 'recall':              return adminRecall_(d);
    case 'admin_get_report':    return adminGetReport_(d);
    case 'list_entries':        requireAdmin_(d); return { ok: true, entries: readAll_(SHEETS.entries) };
    // Employee
    case 'list_my_projects':    return employeeListProjects_(d);
    case 'get_project':         return employeeGetProject_(d);
    case 'save_draft':          return employeeWrite_(d, false);
    case 'submit_report':       return employeeWrite_(d, true);
    default: return { ok: false, error: 'Unknown action: ' + action };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Employees
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateEmployee_(d) {
  requireAdmin_(d);
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Invalid email' };
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  var rate = num_(d.rate);
  var existing = findRow_(SHEETS.employees, 'Email', email);
  if (existing) {
    updateRow_(SHEETS.employees, 'Email', email, { FullName: trim_(d.fullName), Rate: rate, Currency: currency });
    return { ok: true, updated: true };
  }
  appendRow_(SHEETS.employees, {
    Email: email, FullName: trim_(d.fullName), Rate: rate, Currency: currency, CreatedAt: new Date().toISOString()
  });
  return { ok: true };
}
function adminDeleteEmployee_(d) {
  requireAdmin_(d);
  var email = normEmail_(d.email);
  var sh = getSheet_(SHEETS.employees), values = sh.getDataRange().getValues(), col = values[0].indexOf('Email');
  for (var i = values.length - 1; i >= 1; i--) if (normEmail_(values[i][col]) === email) sh.deleteRow(i + 1);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateProject_(d) {
  requireAdmin_(d);
  var name = trim_(d.name);
  if (!name) return { ok: false, error: 'Project name is required' };
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Select an employee' };
  var emp = findRow_(SHEETS.employees, 'Email', email);
  if (!emp) return { ok: false, error: 'Employee not found in the directory' };

  // Rate and currency are snapshotted from the employee's record.
  var currency = CURRENCIES.indexOf(trim_(emp.Currency)) >= 0 ? trim_(emp.Currency) : 'USD';
  var row = {
    ProjectID: Utilities.getUuid(), Name: name, Customer: trim_(d.customer),
    EmployeeEmail: email, EmployeeName: emp.FullName || '', Currency: currency, Rate: num_(emp.Rate),
    Comment: trim_(d.comment), Status: 'created', ReportedHours: '', ReportedAmount: '',
    ReleasedAt: '', SubmittedAt: '', UpdatedAt: '', CreatedAt: new Date().toISOString()
  };
  appendRow_(SHEETS.projects, row);
  return { ok: true, project: row };
}

function adminRelease_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };

  var sym = curSym_(p.Currency);
  var link = CONFIG.EMPLOYEE_BASE_URL + '?email=' + encodeURIComponent(p.EmployeeEmail) +
             '&pid=' + encodeURIComponent(p.ProjectID);
  var hello = p.EmployeeName ? ('Hello, ' + esc_(p.EmployeeName) + '!') : 'Hello!';
  var subject = 'New report: ' + p.Name + ' (' + CONFIG.COMPANY_NAME + ')';
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p>' + hello + '</p>' +
    '<p>You have been asked to prepare a report for the project <b>' + esc_(p.Name) + '</b>' +
    (p.Customer ? ' (customer: ' + esc_(p.Customer) + ')' : '') + '.</p>' +
    '<p>Your rate: <b>' + sym + p.Rate + '/h</b>.</p>' +
    (p.Comment ? '<p>Comment: ' + esc_(p.Comment) + '</p>' : '') +
    '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open report</a></p>' +
    '<p style="color:#5B6671;font-size:12px">If the button does not work, copy this link:<br>' + link + '</p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: p.EmployeeEmail, subject: subject, htmlBody: html });

  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, { Status: 'released', ReleasedAt: new Date().toISOString() });
  return { ok: true };
}

function adminRecall_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, { Status: 'created', ReleasedAt: '' });
  return { ok: true };
}

function adminGetReport_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.ProjectID === p.ProjectID; });
  return { ok: true, project: p, items: items };
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee
// ─────────────────────────────────────────────────────────────────────────────
function employeeListProjects_(d) {
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Enter a valid email' };
  var rows = readAll_(SHEETS.projects).filter(function (r) {
    return normEmail_(r.EmployeeEmail) === email && r.Status !== 'created';
  });
  return { ok: true, email: email, projects: rows };
}

function employeeGetProject_(d) {
  var email = normEmail_(d.email);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  if (normEmail_(p.EmployeeEmail) !== email) return { ok: false, error: 'No access to this report' };
  if (p.Status === 'created') return { ok: false, error: 'Task unavailable (not released or recalled by admin)' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.ProjectID === p.ProjectID; });
  return { ok: true, project: p, items: items };
}

function employeeWrite_(d, finalize) {
  var email = normEmail_(d.email);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  if (normEmail_(p.EmployeeEmail) !== email) return { ok: false, error: 'No access to this report' };
  if (p.Status === 'created') return { ok: false, error: 'Task was recalled by admin — changes are not allowed' };

  var activities = (Array.isArray(d.activities) ? d.activities : [])
    .map(function (a) { return trim_(a); }).filter(function (a) { return a; });
  var hours = num_(d.hours);
  if (finalize && (!activities.length || hours <= 0))
    return { ok: false, error: 'Add at least one activity and the total hours' };

  var rate = num_(p.Rate), amount = round2_(hours * rate), now = new Date().toISOString();
  deleteEntriesForProject_(p.ProjectID);
  activities.forEach(function (desc) {
    appendRow_(SHEETS.entries, {
      EntryID: Utilities.getUuid(), ProjectID: p.ProjectID, ProjectName: p.Name,
      EmployeeEmail: email, ActivityDescription: desc, CreatedAt: now
    });
  });

  var upd = { ReportedHours: hours, ReportedAmount: amount, UpdatedAt: now };
  if (finalize) { upd.Status = 'submitted'; upd.SubmittedAt = now; }
  else { upd.Status = 'draft'; }
  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, upd);

  if (finalize) notifyAdminSubmitted_(p, hours, amount);
  return { ok: true, finalized: !!finalize, totals: { hours: round2_(hours), amount: amount, activities: activities.length } };
}

function notifyAdminSubmitted_(p, hours, amount) {
  var to = CONFIG.ADMIN_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var sym = curSym_(p.Currency);
  var who = (p.EmployeeName ? esc_(p.EmployeeName) + ' (' + p.EmployeeEmail + ')' : p.EmployeeEmail);
  var subject = 'Report ready: ' + p.Name + ' — ' + (p.EmployeeName || p.EmployeeEmail);
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p><b>' + who + '</b> has submitted a report for the project <b>' + esc_(p.Name) + '</b>.</p>' +
    '<p>Total: <b>' + hours + ' h</b> for <b>' + sym + amount + '</b>.</p>' +
    '<p><a href="' + CONFIG.ADMIN_BASE_URL + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open admin panel</a></p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html });
}

// ─────────────────────────────────────────────────────────────────────────────
function requireAdmin_(d) {
  if (trim_(d.passcode) !== CONFIG.ADMIN_PASSCODE) throw new Error('Invalid admin PIN');
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets helpers
// ─────────────────────────────────────────────────────────────────────────────
function ss_() { return CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(HEADERS[keyByName_(name)]); sh.setFrozenRows(1); }
  return sh;
}
function keyByName_(name) { for (var k in SHEETS) if (SHEETS[k] === name) return k; return null; }
function readAll_(name) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0], out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {}; for (var j = 0; j < head.length; j++) obj[head[j]] = values[i][j]; out.push(obj);
  }
  return out;
}
function appendRow_(name, obj) {
  var sh = getSheet_(name), head = HEADERS[keyByName_(name)];
  sh.appendRow(head.map(function (h) { return obj[h] != null ? obj[h] : ''; }));
}
function findRow_(name, idField, idValue) {
  if (idValue === '' || idValue == null) return null;
  var all = readAll_(name), norm = (idField === 'Email');
  var target = norm ? normEmail_(idValue) : String(idValue);
  for (var i = 0; i < all.length; i++) {
    var v = norm ? normEmail_(all[i][idField]) : String(all[i][idField]);
    if (v === target) return all[i];
  }
  return null;
}
function updateRow_(name, idField, idValue, updates) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues(), head = values[0];
  var idCol = head.indexOf(idField), norm = (idField === 'Email');
  var target = norm ? normEmail_(idValue) : String(idValue);
  for (var i = 1; i < values.length; i++) {
    var v = norm ? normEmail_(values[i][idCol]) : String(values[i][idCol]);
    if (v === target) {
      for (var key in updates) { var c = head.indexOf(key); if (c >= 0) sh.getRange(i + 1, c + 1).setValue(updates[key]); }
      return true;
    }
  }
  return false;
}
function deleteEntriesForProject_(projectId) {
  var sh = getSheet_(SHEETS.entries), values = sh.getDataRange().getValues(), col = values[0].indexOf('ProjectID');
  for (var i = values.length - 1; i >= 1; i--) if (String(values[i][col]) === String(projectId)) sh.deleteRow(i + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
function jsonOut_(obj, e) {
  var txt = JSON.stringify(obj), cb = e && e.parameter && e.parameter.callback;
  if (cb) return ContentService.createTextOutput(cb + '(' + txt + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
function trim_(v) { return v == null ? '' : String(v).trim(); }
function normEmail_(v) { return trim_(v).toLowerCase(); }
function isEmail_(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
function num_(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
function round2_(n) { return Math.round(n * 100) / 100; }
function curSym_(c) { return c === 'EUR' ? '€' : '$'; }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setup() {
  getSheet_(SHEETS.employees); getSheet_(SHEETS.projects); getSheet_(SHEETS.entries);
  SpreadsheetApp.getActive().toast('Sheets created.');
}
