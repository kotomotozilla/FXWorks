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
  ADMIN_EMAIL: '',                 // recommended: set this so submit emails reach you
  SHEET_ID: '',
  COMPANY_NAME: 'Fraktalex Limited'
};

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { employees: 'Employees', projects: 'Projects', assignments: 'Assignments', entries: 'Entries' };

const HEADERS = {
  employees:   ['Email', 'FullName', 'Rate', 'Currency', 'Password', 'CreatedAt'],
  projects:    ['ProjectID', 'Name', 'Customer', 'CreatedAt', 'UpdatedAt'],
  assignments: ['AssignmentID', 'ProjectID', 'ProjectName', 'Customer', 'EmployeeEmail', 'EmployeeName',
                'Currency', 'Rate', 'Comment', 'LastNotifiedComment', 'Status', 'ReportedHours', 'ReportedAmount',
                'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt'],
  entries:     ['EntryID', 'AssignmentID', 'ProjectID', 'ProjectName', 'EmployeeEmail', 'ActivityDescription', 'CreatedAt']
};

const CURRENCIES = ['USD', 'EUR'];
// Statuses: released (active, visible) | recalled (hidden) | draft | submitted

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
    case 'admin_login':        requireAdmin_(d); return { ok: true };
    // Employees
    case 'create_employee':    return adminCreateEmployee_(d);
    case 'list_employees':     requireAdmin_(d); return { ok: true, employees: readAll_(SHEETS.employees) };
    case 'delete_employee':    return adminDeleteEmployee_(d);
    // Projects
    case 'create_project':     return adminCreateProject_(d);
    case 'list_projects':      requireAdmin_(d); return { ok: true, projects: readAll_(SHEETS.projects), assignments: readAll_(SHEETS.assignments) };
    case 'get_project':        return adminGetProject_(d);
    case 'update_project':     return adminUpdateProject_(d);
    case 'delete_project':     return adminDeleteProject_(d);
    // Assignments
    case 'add_assignment':     return adminAddAssignment_(d);
    case 'update_assignment':  return adminUpdateAssignment_(d);
    case 'recall_assignment':  return adminSetStatus_(d, 'recalled', false);
    case 'release_assignment': return adminSetStatus_(d, 'released', true);
    case 'delete_assignment':  return adminDeleteAssignment_(d);
    case 'admin_get_report':   return adminGetReport_(d);
    case 'admin_save_report':  return adminSaveReport_(d);
    // Employee
    case 'list_my_assignments': return employeeList_(d);
    case 'get_assignment':      return employeeGet_(d);
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
  var rate = num_(d.rate), pwd = trim_(d.password);
  var existing = findRow_(SHEETS.employees, 'Email', email);
  if (existing) {
    var upd = { FullName: trim_(d.fullName), Rate: rate, Currency: currency };
    if (pwd) upd.Password = pwd;                 // blank keeps the old password
    updateRow_(SHEETS.employees, 'Email', email, upd);
    return { ok: true, updated: true };
  }
  appendRow_(SHEETS.employees, {
    Email: email, FullName: trim_(d.fullName), Rate: rate, Currency: currency,
    Password: pwd, CreatedAt: new Date().toISOString()
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
  var now = new Date().toISOString();
  var row = { ProjectID: Utilities.getUuid(), Name: name, Customer: trim_(d.customer), CreatedAt: now, UpdatedAt: now };
  appendRow_(SHEETS.projects, row);
  return { ok: true, project: row };
}
function adminGetProject_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  var assignments = readAll_(SHEETS.assignments).filter(function (a) { return a.ProjectID === p.ProjectID; });
  return { ok: true, project: p, assignments: assignments };
}
function adminUpdateProject_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  var name = trim_(d.name); if (!name) return { ok: false, error: 'Project name is required' };
  var customer = trim_(d.customer);
  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, { Name: name, Customer: customer, UpdatedAt: new Date().toISOString() });
  // Denormalize onto assignments and entries.
  readAll_(SHEETS.assignments).forEach(function (a) {
    if (a.ProjectID === p.ProjectID) updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { ProjectName: name, Customer: customer });
  });
  readAll_(SHEETS.entries).forEach(function (en) {
    if (en.ProjectID === p.ProjectID) updateRow_(SHEETS.entries, 'EntryID', en.EntryID, { ProjectName: name });
  });
  return { ok: true };
}
function adminDeleteProject_(d) {
  requireAdmin_(d);
  var pid = trim_(d.projectId);
  deleteRowsWhere_(SHEETS.entries, 'ProjectID', pid);
  deleteRowsWhere_(SHEETS.assignments, 'ProjectID', pid);
  deleteRowsWhere_(SHEETS.projects, 'ProjectID', pid);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignments
// ─────────────────────────────────────────────────────────────────────────────
function adminAddAssignment_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Select an employee' };
  var emp = findRow_(SHEETS.employees, 'Email', email);
  if (!emp) return { ok: false, error: 'Employee not found in the directory' };

  var dup = readAll_(SHEETS.assignments).some(function (a) {
    return a.ProjectID === p.ProjectID && normEmail_(a.EmployeeEmail) === email;
  });
  if (dup) return { ok: false, error: 'This employee is already assigned to the project' };

  var currency = CURRENCIES.indexOf(trim_(emp.Currency)) >= 0 ? trim_(emp.Currency) : 'USD';
  var comment = trim_(d.comment), now = new Date().toISOString();
  var row = {
    AssignmentID: Utilities.getUuid(), ProjectID: p.ProjectID, ProjectName: p.Name, Customer: p.Customer,
    EmployeeEmail: email, EmployeeName: emp.FullName || '', Currency: currency, Rate: num_(emp.Rate),
    Comment: comment, LastNotifiedComment: comment, Status: 'released', ReportedHours: '', ReportedAmount: '',
    ReleasedAt: now, SubmittedAt: '', UpdatedAt: now, CreatedAt: now
  };
  appendRow_(SHEETS.assignments, row);
  notifyEmployee_(row);            // newly added -> always notify
  return { ok: true, assignment: row };
}

function adminUpdateAssignment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var comment = trim_(d.comment);
  var changed = comment !== trim_(a.LastNotifiedComment);
  var upd = { Comment: comment, UpdatedAt: new Date().toISOString() };
  if (changed) {
    upd.LastNotifiedComment = comment;
    if (a.Status === 'recalled') upd.Status = 'released';   // re-activate when re-engaging
    if (!a.ReleasedAt) upd.ReleasedAt = new Date().toISOString();
  }
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  if (changed) { a.Comment = comment; notifyEmployee_(a); } // comment changed -> notify
  return { ok: true, notified: changed };
}

function adminSetStatus_(d, status, notify) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var upd = { Status: status, UpdatedAt: new Date().toISOString() };
  if (status === 'released') { upd.ReleasedAt = new Date().toISOString(); upd.LastNotifiedComment = trim_(a.Comment); }
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  if (notify) { a.Status = status; notifyEmployee_(a); }
  return { ok: true };
}

function adminDeleteAssignment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  deleteRowsWhere_(SHEETS.entries, 'AssignmentID', a.AssignmentID);
  deleteRowsWhere_(SHEETS.assignments, 'AssignmentID', a.AssignmentID);
  return { ok: true };
}

function adminGetReport_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.AssignmentID === a.AssignmentID; });
  return { ok: true, assignment: a, items: items };
}

function adminSaveReport_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var activities = (Array.isArray(d.activities) ? d.activities : []).map(function (x) { return trim_(x); }).filter(function (x) { return x; });
  var hours = num_(d.hours);
  var rate = num_(a.Rate), amount = round2_(hours * rate), now = new Date().toISOString();
  deleteRowsWhere_(SHEETS.entries, 'AssignmentID', a.AssignmentID);
  activities.forEach(function (desc) {
    appendRow_(SHEETS.entries, {
      EntryID: Utilities.getUuid(), AssignmentID: a.AssignmentID, ProjectID: a.ProjectID,
      ProjectName: a.ProjectName, EmployeeEmail: a.EmployeeEmail, ActivityDescription: desc, CreatedAt: now
    });
  });
  // Status is left unchanged; admin edits don't auto-submit/withdraw.
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { ReportedHours: hours, ReportedAmount: amount, UpdatedAt: now });
  return { ok: true, totals: { hours: round2_(hours), amount: amount, activities: activities.length } };
}

function notifyEmployee_(a) {
  try {
    var sym = curSym_(a.Currency);
    var link = CONFIG.EMPLOYEE_BASE_URL + '?email=' + encodeURIComponent(a.EmployeeEmail) + '&aid=' + encodeURIComponent(a.AssignmentID);
    var hello = a.EmployeeName ? ('Hello, ' + esc_(a.EmployeeName) + '!') : 'Hello!';
    var subject = 'New report: ' + a.ProjectName + ' (' + CONFIG.COMPANY_NAME + ')';
    var html =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
      '<p>' + hello + '</p>' +
      '<p>You have been asked to prepare a report for the project <b>' + esc_(a.ProjectName) + '</b>' +
      (a.Customer ? ' (customer: ' + esc_(a.Customer) + ')' : '') + '.</p>' +
      '<p>Your rate: <b>' + sym + a.Rate + '/h</b>.</p>' +
      (a.Comment ? '<p>Comment: ' + esc_(a.Comment) + '</p>' : '') +
      '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open report</a></p>' +
      '<p style="color:#5B6671;font-size:12px">You will be asked for your email and password. If the button does not work, copy this link:<br>' + link + '</p>' +
      '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
    MailApp.sendEmail({ to: a.EmployeeEmail, subject: subject, htmlBody: html });
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee (email + password)
// ─────────────────────────────────────────────────────────────────────────────
function verifyEmployee_(d) {
  var email = normEmail_(d.email), pwd = trim_(d.password);
  var e = findRow_(SHEETS.employees, 'Email', email);
  if (!e || String(trim_(e.Password)) !== String(pwd) || trim_(e.Password) === '') return null;
  return e;
}
function employeeList_(d) {
  var emp = verifyEmployee_(d);
  if (!emp) return { ok: false, error: 'Invalid email or password' };
  var email = normEmail_(d.email);
  var rows = readAll_(SHEETS.assignments).filter(function (r) {
    return normEmail_(r.EmployeeEmail) === email && r.Status !== 'recalled';
  });
  return { ok: true, email: email, assignments: rows };
}
function employeeGet_(d) {
  var emp = verifyEmployee_(d);
  if (!emp) return { ok: false, error: 'Invalid email or password' };
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a || normEmail_(a.EmployeeEmail) !== normEmail_(d.email)) return { ok: false, error: 'No access to this report' };
  if (a.Status === 'recalled') return { ok: false, error: 'This task was recalled by the admin' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.AssignmentID === a.AssignmentID; });
  return { ok: true, assignment: a, items: items };
}
function employeeWrite_(d, finalize) {
  var emp = verifyEmployee_(d);
  if (!emp) return { ok: false, error: 'Invalid email or password' };
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a || normEmail_(a.EmployeeEmail) !== normEmail_(d.email)) return { ok: false, error: 'No access to this report' };
  if (a.Status === 'recalled') return { ok: false, error: 'This task was recalled by the admin — changes are not allowed' };

  var activities = (Array.isArray(d.activities) ? d.activities : []).map(function (x) { return trim_(x); }).filter(function (x) { return x; });
  var hours = num_(d.hours);
  if (finalize && (!activities.length || hours <= 0)) return { ok: false, error: 'Add at least one activity and the total hours' };

  var rate = num_(a.Rate), amount = round2_(hours * rate), now = new Date().toISOString();
  deleteRowsWhere_(SHEETS.entries, 'AssignmentID', a.AssignmentID);
  activities.forEach(function (desc) {
    appendRow_(SHEETS.entries, {
      EntryID: Utilities.getUuid(), AssignmentID: a.AssignmentID, ProjectID: a.ProjectID,
      ProjectName: a.ProjectName, EmployeeEmail: normEmail_(d.email), ActivityDescription: desc, CreatedAt: now
    });
  });
  var upd = { ReportedHours: hours, ReportedAmount: amount, UpdatedAt: now };
  if (finalize) { upd.Status = 'submitted'; upd.SubmittedAt = now; } else { upd.Status = 'draft'; }
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);

  if (finalize) { try { notifyAdminSubmitted_(a, hours, amount); } catch (e) {} }
  return { ok: true, finalized: !!finalize, totals: { hours: round2_(hours), amount: amount, activities: activities.length } };
}

function notifyAdminSubmitted_(a, hours, amount) {
  var to = trim_(CONFIG.ADMIN_EMAIL);
  if (!to) { try { to = Session.getEffectiveUser().getEmail(); } catch (e) { to = ''; } }
  if (!to) return;
  var sym = curSym_(a.Currency);
  var who = (a.EmployeeName ? esc_(a.EmployeeName) + ' (' + a.EmployeeEmail + ')' : a.EmployeeEmail);
  var subject = 'Report ready: ' + a.ProjectName + ' — ' + (a.EmployeeName || a.EmployeeEmail);
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p><b>' + who + '</b> has submitted a report for the project <b>' + esc_(a.ProjectName) + '</b>.</p>' +
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
  var ss = ss_(), sh = ss.getSheetByName(name), want = HEADERS[keyByName_(name)];
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(want); sh.setFrozenRows(1); return sh; }
  var lastCol = sh.getLastColumn();
  var have = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (!headersMatch_(have, want)) {
    if (sh.getLastRow() <= 1) {
      sh.clear(); sh.getRange(1, 1, 1, want.length).setValues([want]); sh.setFrozenRows(1);
    } else {
      var stamp = Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss');
      sh.setName(name + '_old_' + stamp);
      sh = ss.insertSheet(name); sh.appendRow(want); sh.setFrozenRows(1);
    }
  }
  return sh;
}
function headersMatch_(have, want) {
  if (!have || have.length < want.length) return false;
  for (var i = 0; i < want.length; i++) if (String(have[i]).trim() !== want[i]) return false;
  return true;
}
function keyByName_(name) { for (var k in SHEETS) if (SHEETS[k] === name) return k; return null; }
function readAll_(name) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0], out = [];
  for (var i = 1; i < values.length; i++) { var o = {}; for (var j = 0; j < head.length; j++) o[head[j]] = values[i][j]; out.push(o); }
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
function deleteRowsWhere_(name, field, value) {
  var sh = getSheet_(name), values = sh.getDataRange().getValues(), col = values[0].indexOf(field);
  if (col < 0) return;
  for (var i = values.length - 1; i >= 1; i--) if (String(values[i][col]) === String(value)) sh.deleteRow(i + 1);
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
  getSheet_(SHEETS.employees); getSheet_(SHEETS.projects); getSheet_(SHEETS.assignments); getSheet_(SHEETS.entries);
  SpreadsheetApp.getActive().toast('Sheets created.');
}
