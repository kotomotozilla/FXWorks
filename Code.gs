/**
 * Fraktalex — Reporting collection system
 * Backend: Google Apps Script (Web App) + Google Sheets as storage.
 * Deployment: see SETUP.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — fill in before deployment
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  ADMIN_PASSCODE: '12345',
  EMPLOYEE_BASE_URL: 'https://kotomotozilla.github.io/FXWorks/employee.html',
  ADMIN_BASE_URL:    'https://kotomotozilla.github.io/FXWorks/admin.html',
  // Admin email for "report ready" notifications.
  // If empty — the script owner's address is used.
  ADMIN_EMAIL: 'info@fraktalex.com',
  SHEET_ID: '',
  COMPANY_NAME: 'Fraktalex Limited'
};

// Bump this on every backend change so the admin panel can confirm the new code is deployed.
const BUILD = '2026-07-05.5';

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { counterparties: 'Counterparties', employees: 'Employees', contracts: 'Contracts', invoices: 'Invoices', projects: 'Projects', assignments: 'Assignments', entries: 'Entries' };

const HEADERS = {
  counterparties: ['CounterpartyID', 'Name', 'Type', 'Address', 'Email', 'Phone', 'Password', 'HasReportingAccess', 'Rate', 'Currency', 'CreatedAt'],
  employees:   ['Email', 'FullName', 'Rate', 'Currency', 'Password', 'CreatedAt'],
  contracts:   ['ContractID', 'Number', 'Description', 'CounterpartyID', 'Direction', 'SignDate', 'StartDate', 'EndDate',
                'Amount', 'Currency', 'AmountUSD', 'FxRate', 'FxAsOf', 'ParentContractID', 'CreatedAt'],
  invoices:    ['InvoiceID', 'Number', 'ContractID', 'CounterpartyID', 'InvoiceDate', 'DueDate',
                'Amount', 'Currency', 'AmountUSD', 'FxRate', 'FxAsOf', 'CreatedAt'],
  projects:    ['ProjectID', 'Name', 'Customer', 'Description', 'ContractID', 'CreatedAt', 'UpdatedAt'],
  assignments: ['AssignmentID', 'ProjectID', 'ProjectName', 'Customer', 'ProjectDescription', 'EmployeeEmail', 'EmployeeName',
                'Title', 'Currency', 'Rate', 'Comment', 'LastNotifiedComment', 'Status', 'ReportedHours', 'ReportedAmount',
                'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt'],
  entries:     ['EntryID', 'AssignmentID', 'ProjectID', 'ProjectName', 'EmployeeEmail', 'ActivityDescription', 'CreatedAt']
};

const CURRENCIES = ['USD', 'EUR', 'AED', 'SGD'];
// Statuses: released (active, visible) | recalled (hidden) | draft | submitted

// ─────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') return jsonOut_({ ok: true, service: 'fraktalex-reports', build: BUILD, time: new Date().toISOString() }, e);
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
    case 'admin_login':        requireAdmin_(d); return { ok: true, build: BUILD };
    // Employees
    case 'save_counterparty':  return adminSaveCounterparty_(d);
    case 'list_counterparties': requireAdmin_(d); ensureCounterparties_(); return { ok: true, counterparties: readAll_(SHEETS.counterparties) };
    case 'delete_counterparty': return adminDeleteCounterparty_(d);
    case 'invite_counterparty': return adminInviteCounterparty_(d);
    // Contracts
    case 'create_contract':    return adminCreateContract_(d);
    case 'list_contracts':     requireAdmin_(d); return { ok: true, contracts: readAll_(SHEETS.contracts) };
    case 'update_contract':    return adminUpdateContract_(d);
    case 'delete_contract':    return adminDeleteContract_(d);
    // Invoices
    case 'create_invoice':     return adminCreateInvoice_(d);
    case 'list_invoices':      requireAdmin_(d); return { ok: true, invoices: readAll_(SHEETS.invoices) };
    case 'update_invoice':     return adminUpdateInvoice_(d);
    case 'delete_invoice':     return adminDeleteInvoice_(d);
    case 'recalc_contract_fx': return adminRecalcContractFx_(d);
    case 'recalc_invoice_fx':  return adminRecalcInvoiceFx_(d);
    case 'recalc_all_fx':      return adminRecalcAllFx_(d);
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
    case 'reopen_assignment':  return adminReopen_(d);
    case 'remind_assignment':  return adminRemind_(d);
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
function ensureCounterparties_() {
  getSheet_(SHEETS.counterparties);
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('cp_migrated')) return;
  var rows = readAll_(SHEETS.counterparties);
  if (rows.length) { props.setProperty('cp_migrated', '1'); return; }
  // One-time migration from the old Employees directory (kept as a backup).
  var emps = readAll_(SHEETS.employees);
  emps.forEach(function (e) {
    appendRow_(SHEETS.counterparties, {
      CounterpartyID: Utilities.getUuid(), Name: e.FullName || e.Email, Type: 'individual',
      Address: '', Email: normEmail_(e.Email), Phone: '', Password: e.Password || '',
      HasReportingAccess: 'yes', Rate: e.Rate || '', Currency: e.Currency || 'USD',
      CreatedAt: e.CreatedAt || new Date().toISOString()
    });
  });
  props.setProperty('cp_migrated', '1');
}

function adminSaveCounterparty_(d) {
  requireAdmin_(d);
  ensureCounterparties_();
  var name = trim_(d.name);
  if (!name) return { ok: false, error: 'Name is required' };
  var type = (trim_(d.type) === 'business') ? 'business' : 'individual';
  var email = normEmail_(d.email);
  var access = truthy_(d.hasAccess) ? 'yes' : 'no';
  var pwd = trim_(d.password), rate = num_(d.rate);
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  var phone = trim_(d.phone), address = trim_(d.address), id = trim_(d.id);

  if (access === 'yes' && !isEmail_(email)) return { ok: false, error: 'Reporting access requires a valid email' };
  if (email) {
    var clash = readAll_(SHEETS.counterparties).some(function (c) {
      return normEmail_(c.Email) === email && String(c.CounterpartyID) !== String(id);
    });
    if (clash) return { ok: false, error: 'Another counterparty already uses this email' };
  }

  if (id) {
    var rec = findRow_(SHEETS.counterparties, 'CounterpartyID', id);
    if (!rec) return { ok: false, error: 'Counterparty not found' };
    var oldEmail = normEmail_(rec.Email);
    var upd = { Name: name, Type: type, Address: address, Email: email, Phone: phone, HasReportingAccess: access, Rate: rate, Currency: currency };
    if (pwd) upd.Password = pwd;                 // blank keeps the old password
    updateRow_(SHEETS.counterparties, 'CounterpartyID', id, upd);
    // Reporting link is by email — cascade email/name changes onto assignments and entries.
    if (oldEmail && oldEmail !== email) {
      readAll_(SHEETS.assignments).forEach(function (a) { if (normEmail_(a.EmployeeEmail) === oldEmail) updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { EmployeeEmail: email, EmployeeName: name }); });
      readAll_(SHEETS.entries).forEach(function (en) { if (normEmail_(en.EmployeeEmail) === oldEmail) updateRow_(SHEETS.entries, 'EntryID', en.EntryID, { EmployeeEmail: email }); });
    } else if (email) {
      readAll_(SHEETS.assignments).forEach(function (a) { if (normEmail_(a.EmployeeEmail) === email) updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { EmployeeName: name }); });
    }
    return { ok: true, updated: true };
  }

  appendRow_(SHEETS.counterparties, {
    CounterpartyID: Utilities.getUuid(), Name: name, Type: type, Address: address, Email: email, Phone: phone,
    Password: pwd, HasReportingAccess: access, Rate: rate, Currency: currency, CreatedAt: new Date().toISOString()
  });
  return { ok: true };
}

function adminDeleteCounterparty_(d) {
  requireAdmin_(d);
  ensureCounterparties_();
  deleteRowsWhere_(SHEETS.counterparties, 'CounterpartyID', trim_(d.id));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contracts
// ─────────────────────────────────────────────────────────────────────────────
function autoNumber_(sheetName, dateField, dateStr, prefix) {
  var d = (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : new Date().toISOString().slice(0, 10);
  var p = d.split('-'), n = 0;
  readAll_(sheetName).forEach(function (r) { if (String(r[dateField]).slice(0, 10) === d) n++; });
  return prefix + '/' + p[0] + '/' + p[1] + '/' + p[2] + '-' + (n + 1);
}
function numberTaken_(sheetName, number, excludeId, idField) {
  return readAll_(sheetName).some(function (r) {
    return String(r.Number).trim() === number && String(r[idField]) !== String(excludeId);
  });
}
function contractFields_(d) {
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  return {
    Description: trim_(d.description), CounterpartyID: trim_(d.counterpartyId),
    Direction: (trim_(d.direction) === 'outgoing') ? 'outgoing' : 'incoming',
    SignDate: trim_(d.signDate), StartDate: trim_(d.startDate), EndDate: trim_(d.endDate),
    Amount: num_(d.amount), Currency: currency, ParentContractID: trim_(d.parentContractId)
  };
}
function adminCreateContract_(d) {
  requireAdmin_(d);
  var f = contractFields_(d);
  var number = trim_(d.number);
  if (!number) number = autoNumber_(SHEETS.contracts, 'SignDate', f.SignDate, 'agr');
  else if (numberTaken_(SHEETS.contracts, number, '', 'ContractID')) return { ok: false, error: 'Contract number already exists' };
  var row = {
    ContractID: Utilities.getUuid(), Number: number, Description: f.Description, CounterpartyID: f.CounterpartyID,
    Direction: f.Direction, SignDate: f.SignDate, StartDate: f.StartDate, EndDate: f.EndDate,
    Amount: f.Amount, Currency: f.Currency, AmountUSD: '', FxRate: '', FxAsOf: '',
    ParentContractID: f.ParentContractID, CreatedAt: new Date().toISOString()
  };
  var fx = computeFx_(f.Currency, f.Amount, f.SignDate);
  row.AmountUSD = fx.AmountUSD; row.FxRate = fx.FxRate; row.FxAsOf = fx.FxAsOf;
  appendRow_(SHEETS.contracts, row);
  return { ok: true, contract: row };
}
function adminUpdateContract_(d) {
  requireAdmin_(d);
  var id = trim_(d.id), c = findRow_(SHEETS.contracts, 'ContractID', id);
  if (!c) return { ok: false, error: 'Contract not found' };
  var f = contractFields_(d);
  if (f.ParentContractID === id) return { ok: false, error: 'A contract cannot be its own parent' };
  var number = trim_(d.number) || c.Number;
  if (numberTaken_(SHEETS.contracts, number, id, 'ContractID')) return { ok: false, error: 'Contract number already exists' };
  var cfx = computeFx_(f.Currency, f.Amount, f.SignDate);
  updateRow_(SHEETS.contracts, 'ContractID', id, {
    Number: number, Description: f.Description, CounterpartyID: f.CounterpartyID, Direction: f.Direction,
    SignDate: f.SignDate, StartDate: f.StartDate, EndDate: f.EndDate, Amount: f.Amount, Currency: f.Currency,
    AmountUSD: cfx.AmountUSD, FxRate: cfx.FxRate, FxAsOf: cfx.FxAsOf,
    ParentContractID: f.ParentContractID
  });
  return { ok: true };
}
function adminDeleteContract_(d) {
  requireAdmin_(d);
  var id = trim_(d.id);
  // Clear references so nothing dangles.
  readAll_(SHEETS.projects).forEach(function (p) { if (String(p.ContractID) === id) updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, { ContractID: '' }); });
  readAll_(SHEETS.contracts).forEach(function (c) { if (String(c.ParentContractID) === id) updateRow_(SHEETS.contracts, 'ContractID', c.ContractID, { ParentContractID: '' }); });
  readAll_(SHEETS.invoices).forEach(function (v) { if (String(v.ContractID) === id) updateRow_(SHEETS.invoices, 'InvoiceID', v.InvoiceID, { ContractID: '' }); });
  deleteRowsWhere_(SHEETS.contracts, 'ContractID', id);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Invoices  (direction is derived from the linked contract, not stored)
// ─────────────────────────────────────────────────────────────────────────────
function invoiceFields_(d) {
  var currency = CURRENCIES.indexOf(trim_(d.currency)) >= 0 ? trim_(d.currency) : 'USD';
  return {
    ContractID: trim_(d.contractId), CounterpartyID: trim_(d.counterpartyId),
    InvoiceDate: trim_(d.invoiceDate), DueDate: trim_(d.dueDate),
    Amount: num_(d.amount), Currency: currency
  };
}
function adminCreateInvoice_(d) {
  requireAdmin_(d);
  var f = invoiceFields_(d);
  var number = trim_(d.number);
  if (!number) number = autoNumber_(SHEETS.invoices, 'InvoiceDate', f.InvoiceDate, 'inv');
  else if (numberTaken_(SHEETS.invoices, number, '', 'InvoiceID')) return { ok: false, error: 'Invoice number already exists' };
  var row = {
    InvoiceID: Utilities.getUuid(), Number: number, ContractID: f.ContractID, CounterpartyID: f.CounterpartyID,
    InvoiceDate: f.InvoiceDate, DueDate: f.DueDate, Amount: f.Amount, Currency: f.Currency,
    AmountUSD: '', FxRate: '', FxAsOf: '', CreatedAt: new Date().toISOString()
  };
  var ifx = computeFx_(f.Currency, f.Amount, f.InvoiceDate);
  row.AmountUSD = ifx.AmountUSD; row.FxRate = ifx.FxRate; row.FxAsOf = ifx.FxAsOf;
  appendRow_(SHEETS.invoices, row);
  return { ok: true, invoice: row };
}
function adminUpdateInvoice_(d) {
  requireAdmin_(d);
  var id = trim_(d.id), v = findRow_(SHEETS.invoices, 'InvoiceID', id);
  if (!v) return { ok: false, error: 'Invoice not found' };
  var f = invoiceFields_(d);
  var number = trim_(d.number) || v.Number;
  if (numberTaken_(SHEETS.invoices, number, id, 'InvoiceID')) return { ok: false, error: 'Invoice number already exists' };
  var vfx = computeFx_(f.Currency, f.Amount, f.InvoiceDate);
  updateRow_(SHEETS.invoices, 'InvoiceID', id, {
    Number: number, ContractID: f.ContractID, CounterpartyID: f.CounterpartyID,
    InvoiceDate: f.InvoiceDate, DueDate: f.DueDate, Amount: f.Amount, Currency: f.Currency,
    AmountUSD: vfx.AmountUSD, FxRate: vfx.FxRate, FxAsOf: vfx.FxAsOf
  });
  return { ok: true };
}
function adminDeleteInvoice_(d) {
  requireAdmin_(d);
  deleteRowsWhere_(SHEETS.invoices, 'InvoiceID', trim_(d.id));
  return { ok: true };
}

function adminRecalcContractFx_(d) {
  requireAdmin_(d);
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.id));
  if (!c) return { ok: false, error: 'Contract not found' };
  var fx = computeFx_(c.Currency, c.Amount, c.SignDate);
  if (fx.AmountUSD === '') return { ok: false, error: 'Rate unavailable right now — try again later' };
  updateRow_(SHEETS.contracts, 'ContractID', c.ContractID, fx);
  return { ok: true, fx: fx };
}
function adminRecalcInvoiceFx_(d) {
  requireAdmin_(d);
  var v = findRow_(SHEETS.invoices, 'InvoiceID', trim_(d.id));
  if (!v) return { ok: false, error: 'Invoice not found' };
  var fx = computeFx_(v.Currency, v.Amount, v.InvoiceDate);
  if (fx.AmountUSD === '') return { ok: false, error: 'Rate unavailable right now — try again later' };
  updateRow_(SHEETS.invoices, 'InvoiceID', v.InvoiceID, fx);
  return { ok: true, fx: fx };
}
function adminRecalcAllFx_(d) {
  requireAdmin_(d);
  var done = 0, remaining = 0, cap = 40;
  readAll_(SHEETS.contracts).forEach(function (c) {
    if ((c.AmountUSD === '' || c.AmountUSD == null) && num_(c.Amount) > 0) {
      if (done < cap) { var fx = computeFx_(c.Currency, c.Amount, c.SignDate); if (fx.AmountUSD !== '') { updateRow_(SHEETS.contracts, 'ContractID', c.ContractID, fx); done++; } else remaining++; }
      else remaining++;
    }
  });
  readAll_(SHEETS.invoices).forEach(function (v) {
    if ((v.AmountUSD === '' || v.AmountUSD == null) && num_(v.Amount) > 0) {
      if (done < cap) { var fx = computeFx_(v.Currency, v.Amount, v.InvoiceDate); if (fx.AmountUSD !== '') { updateRow_(SHEETS.invoices, 'InvoiceID', v.InvoiceID, fx); done++; } else remaining++; }
      else remaining++;
    }
  });
  return { ok: true, done: done, remaining: remaining };
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────────────────────
function adminCreateProject_(d) {
  requireAdmin_(d);
  var name = trim_(d.name);
  if (!name) return { ok: false, error: 'Project name is required' };
  var now = new Date().toISOString();
  var row = { ProjectID: Utilities.getUuid(), Name: name, Customer: trim_(d.customer), Description: trim_(d.description), ContractID: trim_(d.contractId), CreatedAt: now, UpdatedAt: now };
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
  var customer = trim_(d.customer), desc = trim_(d.description);
  var pupd = { Name: name, Customer: customer, Description: desc, UpdatedAt: new Date().toISOString() };
  if (d.contractId !== undefined) pupd.ContractID = trim_(d.contractId);
  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, pupd);
  // Denormalize onto assignments and entries.
  readAll_(SHEETS.assignments).forEach(function (a) {
    if (a.ProjectID === p.ProjectID) updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { ProjectName: name, Customer: customer, ProjectDescription: desc });
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
  ensureCounterparties_();
  var p = findRow_(SHEETS.projects, 'ProjectID', d.projectId);
  if (!p) return { ok: false, error: 'Project not found' };
  var email = normEmail_(d.email);
  if (!isEmail_(email)) return { ok: false, error: 'Select a team member' };
  var cp = findRow_(SHEETS.counterparties, 'Email', email);
  if (!cp) return { ok: false, error: 'Team member not found in the directory' };
  if (String(trim_(cp.HasReportingAccess)).toLowerCase() !== 'yes') return { ok: false, error: 'This counterparty has no reporting access' };

  // Multiple reports per (project × team member) are allowed; they are distinguished by Title.
  var currency = CURRENCIES.indexOf(trim_(cp.Currency)) >= 0 ? trim_(cp.Currency) : 'USD';
  var comment = trim_(d.comment), title = trim_(d.title), now = new Date().toISOString();
  var row = {
    AssignmentID: Utilities.getUuid(), ProjectID: p.ProjectID, ProjectName: p.Name, Customer: p.Customer, ProjectDescription: p.Description,
    EmployeeEmail: email, EmployeeName: cp.Name || '', Title: title, Currency: currency, Rate: num_(cp.Rate),
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

function adminReopen_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var comment = trim_(d.comment);
  var upd = { Status: 'draft', UpdatedAt: new Date().toISOString() };
  if (comment) { upd.Comment = comment; upd.LastNotifiedComment = comment; }
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  a.Status = 'draft';
  if (comment) a.Comment = comment;
  notifyEmployee_(a, 'reopen');   // team member can edit again; notify them (comment included)
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
  // Admin may optionally submit the report; otherwise status is left unchanged (admin can edit any status).
  // Admin can always set/clear the submission date.
  var sub = trim_(d.submittedDate);
  var upd = { ReportedHours: hours, ReportedAmount: amount, SubmittedAt: sub, UpdatedAt: now };
  if (d.title !== undefined) upd.Title = trim_(d.title);
  if (d.markSubmitted) { upd.Status = 'submitted'; if (!sub) upd.SubmittedAt = now.slice(0, 10); }
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  return { ok: true, totals: { hours: round2_(hours), amount: amount, activities: activities.length } };
}

function notifyEmployee_(a, mode) { try { mailEmployeeReport_(a, mode); } catch (e) {} }

function mailEmployeeReport_(a, mode) {
  var reopen = (mode === 'reopen'), remind = (mode === 'remind');
  var sym = curSym_(a.Currency);
  var link = CONFIG.EMPLOYEE_BASE_URL + '?email=' + encodeURIComponent(a.EmployeeEmail) + '&aid=' + encodeURIComponent(a.AssignmentID);
  var hello = a.EmployeeName ? ('Hello, ' + esc_(a.EmployeeName) + '!') : 'Hello!';
  var subject = (reopen ? 'Report returned for correction: ' : remind ? 'Reminder — report pending: ' : 'New report: ') + a.ProjectName + ' (' + CONFIG.COMPANY_NAME + ')';
  var line = reopen
    ? 'Your report for <b>' + esc_(a.ProjectName) + '</b> has been returned for correction. Please review it and submit again.'
    : remind
    ? 'This is a reminder to complete and submit your report for the project <b>' + esc_(a.ProjectName) + '</b>' + (a.Customer ? ' (customer: ' + esc_(a.Customer) + ')' : '') + '. It has not been submitted yet.'
    : 'You have been asked to prepare a report for the project <b>' + esc_(a.ProjectName) + '</b>' + (a.Customer ? ' (customer: ' + esc_(a.Customer) + ')' : '') + '.';
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p>' + hello + '</p>' +
    '<p>' + line + '</p>' +
    '<p>Your rate: <b>' + sym + a.Rate + '/h</b>.</p>' +
    (a.Comment ? '<p>Comment: ' + esc_(a.Comment) + '</p>' : '') +
    '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open report</a></p>' +
    '<p style="color:#5B6671;font-size:12px">You will be asked for your email and password. If the button does not work, copy this link:<br>' + link + '</p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: a.EmployeeEmail, subject: subject, htmlBody: html });
}

function adminInviteCounterparty_(d) {
  requireAdmin_(d);
  ensureCounterparties_();
  var cp = findRow_(SHEETS.counterparties, 'Email', normEmail_(d.email));
  if (!cp) return { ok: false, error: 'Counterparty not found' };
  if (String(trim_(cp.HasReportingAccess)).toLowerCase() !== 'yes') return { ok: false, error: 'This counterparty has no reporting access' };
  var link = CONFIG.EMPLOYEE_BASE_URL + '?email=' + encodeURIComponent(cp.Email);
  var hello = cp.Name ? ('Hello, ' + esc_(cp.Name) + '!') : 'Hello!';
  var pwd = trim_(cp.Password);
  var pwdLine = pwd ? '<p>Password: <b>' + esc_(pwd) + '</b></p>' : '<p>Your administrator will share your password separately.</p>';
  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15202B;line-height:1.6">' +
    '<p>' + hello + '</p>' +
    '<p>You have access to the ' + esc_(CONFIG.COMPANY_NAME) + ' reporting page, where you can fill in and submit your work reports.</p>' +
    '<p>Login email: <b>' + esc_(cp.Email) + '</b></p>' + pwdLine +
    '<p><a href="' + link + '" style="display:inline-block;background:#2563A8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Open reporting page</a></p>' +
    '<p style="color:#5B6671;font-size:12px">If the button does not work, copy this link:<br>' + link + '</p>' +
    '<p style="color:#5B6671;font-size:12px">' + esc_(CONFIG.COMPANY_NAME) + '</p></div>';
  MailApp.sendEmail({ to: cp.Email, subject: 'Access to ' + CONFIG.COMPANY_NAME + ' reporting', htmlBody: html });
  return { ok: true };
}

function adminRemind_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  if (a.Status === 'submitted') return { ok: false, error: 'Report already submitted — reminder not needed' };
  if (a.Status === 'recalled') return { ok: false, error: 'Task is recalled — release it first' };
  mailEmployeeReport_(a, 'remind');
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Employee (email + password)
// ─────────────────────────────────────────────────────────────────────────────
function verifyEmployee_(d) {
  ensureCounterparties_();
  var email = normEmail_(d.email), pwd = trim_(d.password);
  var c = findRow_(SHEETS.counterparties, 'Email', email);
  if (!c) return null;
  if (String(trim_(c.HasReportingAccess)).toLowerCase() !== 'yes') return null;
  if (trim_(c.Password) === '' || String(trim_(c.Password)) !== String(pwd)) return null;
  return c;
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
  if (a.Status === 'submitted') return { ok: false, error: 'Report already submitted — it is read-only. Ask the admin to return it for correction.' };

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
  var sub = trim_(d.submittedDate);
  var upd = { ReportedHours: hours, ReportedAmount: amount, SubmittedAt: sub, UpdatedAt: now };
  if (finalize) { upd.Status = 'submitted'; if (!sub) upd.SubmittedAt = now.slice(0, 10); } else { upd.Status = 'draft'; }
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
      migrateSheet_(sh, have, want);   // preserve data: remap by column name
    }
  }
  return sh;
}
function migrateSheet_(sh, oldHead, want) {
  var data = sh.getDataRange().getValues(), rows = data.slice(1);
  // Keep any old-only columns by appending them after the wanted ones (no data is lost).
  var extra = [];
  for (var i = 0; i < oldHead.length; i++) {
    var h = String(oldHead[i]).trim();
    if (h && want.indexOf(h) < 0 && extra.indexOf(h) < 0) extra.push(h);
  }
  var newHead = want.concat(extra), out = [newHead];
  for (var r = 0; r < rows.length; r++) {
    out.push(newHead.map(function (col) { var idx = oldHead.indexOf(col); return idx >= 0 ? rows[r][idx] : ''; }));
  }
  sh.clear();
  sh.getRange(1, 1, out.length, newHead.length).setValues(out);
  sh.setFrozenRows(1);
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
  var arr = head.map(function (h) { return obj[h] != null ? obj[h] : ''; });
  sh.appendRow(arr);
  // Keep plain YYYY-MM-DD dates as text (no timezone-shifted serials).
  var r = sh.getLastRow();
  for (var i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(arr[i])) {
      var cell = sh.getRange(r, i + 1); cell.setNumberFormat('@'); cell.setValue(arr[i]);
    }
  }
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
      for (var key in updates) {
        var c = head.indexOf(key);
        if (c >= 0) {
          var cell = sh.getRange(i + 1, c + 1), val = updates[key];
          // Keep plain YYYY-MM-DD dates as text so Sheets does not convert them to a timezone-shifted serial.
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) cell.setNumberFormat('@');
          cell.setValue(val);
        }
      }
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
function truthy_(v) { v = String(v == null ? '' : v).toLowerCase().trim(); return v === 'true' || v === 'yes' || v === '1' || v === 'on'; }
function normEmail_(v) { return trim_(v).toLowerCase(); }
function isEmail_(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
function num_(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
function round2_(n) { return Math.round(n * 100) / 100; }
function curSym_(c) { return c === 'EUR' ? '€' : c === 'AED' ? 'AED ' : c === 'SGD' ? 'S$' : '$'; }

// FX: USD per 1 unit of `currency` on `dateStr` (YYYY-MM-DD). Returns null if unavailable.
function fxRateToUsd_(currency, dateStr) {
  currency = trim_(currency).toUpperCase();
  if (currency === 'USD') return { rate: 1, asOf: dateStr || new Date().toISOString().slice(0, 10) };
  if (currency === 'AED') return { rate: Math.round((1 / 3.6725) * 1e6) / 1e6, asOf: dateStr || new Date().toISOString().slice(0, 10) };
  var d = (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) ? dateStr : 'latest';
  try {
    var url = 'https://api.frankfurter.app/' + d + '?from=' + encodeURIComponent(currency) + '&to=USD';
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      var j = JSON.parse(resp.getContentText());
      if (j && j.rates && j.rates.USD) return { rate: j.rates.USD, asOf: j.date || d };
    }
  } catch (e) {}
  return null;
}
function computeFx_(currency, amount, dateStr) {
  var r = fxRateToUsd_(currency, dateStr);
  if (!r) return { AmountUSD: '', FxRate: '', FxAsOf: '' };
  return { AmountUSD: round2_(num_(amount) * r.rate), FxRate: r.rate, FxAsOf: r.asOf };
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function setup() {
  getSheet_(SHEETS.counterparties); getSheet_(SHEETS.employees); getSheet_(SHEETS.projects); getSheet_(SHEETS.assignments); getSheet_(SHEETS.entries);
  ensureCounterparties_();
  SpreadsheetApp.getActive().toast('Sheets created.');
}
