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
const BUILD = '2026-08-08.14';

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { counterparties: 'Counterparties', requisites: 'Requisites', employees: 'Employees', contracts: 'Contracts', invoices: 'Invoices', attachments: 'Attachments', projects: 'Projects', assignments: 'Assignments', entries: 'Entries' };

const HEADERS = {
  counterparties: ['CounterpartyID', 'Name', 'Type', 'Address', 'Email', 'Phone', 'Password', 'HasReportingAccess', 'Rate', 'Currency', 'RateContractID', 'CreatedAt'],
  requisites:  ['RequisiteID', 'CounterpartyID', 'Label', 'LegalName', 'Jurisdiction', 'RegNumber', 'Address',
                'BankName', 'BankAddress', 'BeneficiaryName', 'AccountNumber', 'Swift', 'CorrBank', 'CorrSwift',
                'SignatoryName', 'SignatoryTitle', 'IsDefault', 'CreatedAt'],
  employees:   ['Email', 'FullName', 'Rate', 'Currency', 'Password', 'CreatedAt'],
  contracts:   ['ContractID', 'Number', 'Description', 'CounterpartyID', 'Direction', 'SignDate', 'StartDate', 'EndDate',
                'Amount', 'Currency', 'AmountUSD', 'FxRate', 'FxAsOf', 'ParentContractID', 'CreatedAt',
                'TemplateType', 'OurRole', 'OurRequisiteID', 'TheirRequisiteID', 'Subject',
                'PaymentOption', 'PaymentDays', 'AdvancePercent', 'AdvanceDays',
                'GoverningLaw', 'JurisdictionPlace', 'ArbitrationBody', 'ArbitrationSeat',
                'RemarksDays', 'AcceptanceDays', 'EvaluationDays', 'DisputeDays', 'CureDays', 'NoticeDays', 'TermYears',
                'WarrantyPeriod', 'PenaltyDelayPercent', 'PenaltyFailurePercent', 'PenaltyCapPercent',
                'InsuranceAmount', 'RestrictedTerritories', 'RateAmount', 'RateBasis',
                'InvoiceTrigger', 'PaymentBasis', 'ReportFrequency', 'CompletionDate', 'PMName', 'SowScope',
                'OptAcceptanceAct', 'OptPenalties', 'OptUsageRights', 'OptInsurance', 'OptDataSecurity', 'OptWarranty',
                'OptPayoutCurrency', 'ExternalForm', 'ExtractedAt', 'PricingType'],
  invoices:    ['InvoiceID', 'Number', 'ContractID', 'CounterpartyID', 'InvoiceDate', 'DueDate',
                'Amount', 'Currency', 'AmountUSD', 'FxRate', 'FxAsOf', 'CreatedAt'],
  attachments: ['AttachmentID', 'ParentType', 'ParentID', 'FileName', 'Description', 'DocType', 'DocDate', 'IsCurrent', 'DriveFileID', 'Url', 'CreatedAt'],
  projects:    ['ProjectID', 'Name', 'Customer', 'CounterpartyID', 'Description', 'ContractID', 'CreatedAt', 'UpdatedAt'],
  assignments: ['AssignmentID', 'ProjectID', 'ProjectName', 'Customer', 'ProjectDescription', 'EmployeeEmail', 'EmployeeName',
                'Title', 'Currency', 'Rate', 'Comment', 'LastNotifiedComment', 'Status', 'ReportedHours', 'ReportedAmount',
                'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt', 'PayoutCurrency', 'AcceptedBy', 'AcceptedAt',
                'ContractID', 'RateSource', 'PricingType'],
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
    // Requisites (bank details + signatory sets per counterparty)
    case 'list_requisites':    requireAdmin_(d); return { ok: true, requisites: adminListRequisites_(d) };
    case 'save_requisite':     return adminSaveRequisite_(d);
    case 'delete_requisite':   return adminDeleteRequisite_(d);
    case 'set_default_requisite': return adminSetDefaultRequisite_(d);
    // Contracts
    case 'create_contract':    return adminCreateContract_(d);
    case 'list_contracts':     requireAdmin_(d); return { ok: true, contracts: readAll_(SHEETS.contracts) };
    case 'update_contract':    return adminUpdateContract_(d);
    case 'delete_contract':    return adminDeleteContract_(d);
    case 'save_contract_doc':  return adminSaveContractDoc_(d);
    case 'extract_contract':   return adminExtractContract_(d);
    case 'extract_upload':     return adminExtractUpload_(d);
    case 'attach_existing':    return adminAttachExisting_(d);
    // Invoices
    case 'create_invoice':     return adminCreateInvoice_(d);
    case 'list_invoices':      requireAdmin_(d); return { ok: true, invoices: readAll_(SHEETS.invoices) };
    case 'update_invoice':     return adminUpdateInvoice_(d);
    case 'delete_invoice':     return adminDeleteInvoice_(d);
    // Attachments (PDF/photo for contracts & invoices, private in owner's Drive)
    case 'add_attachment':     return adminAddAttachment_(d);
    case 'list_attachments':   return adminListAttachments_(d);
    case 'delete_attachment':  return adminDeleteAttachment_(d);
    case 'update_attachment':  return adminUpdateAttachment_(d);
    case 'set_current_attachment': return adminSetCurrentAttachment_(d);
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
    case 'accept_assignment':  return adminAcceptAssignment_(d);
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
  var rateContractId = trim_(d.rateContractId);

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
    var upd = { Name: name, Type: type, Address: address, Email: email, Phone: phone, HasReportingAccess: access, Rate: rate, Currency: currency, RateContractID: rateContractId };
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
    Password: pwd, HasReportingAccess: access, Rate: rate, Currency: currency, RateContractID: rateContractId, CreatedAt: new Date().toISOString()
  });
  return { ok: true };
}

function adminDeleteCounterparty_(d) {
  requireAdmin_(d);
  ensureCounterparties_();
  adminListRequisites_({ counterpartyId: trim_(d.id) }).forEach(function (r) {
    deleteRowsWhere_(SHEETS.requisites, 'RequisiteID', r.RequisiteID);
  });
  deleteRowsWhere_(SHEETS.counterparties, 'CounterpartyID', trim_(d.id));
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments — stored privately in the owner's Google Drive (folder "FXWorks Attachments").
// Files are NOT shared: only the Drive owner (you) can open them.
// ─────────────────────────────────────────────────────────────────────────────
function attachmentsFolder_() {
  var name = 'FXWorks Attachments';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function adminAddAttachment_(d) {
  requireAdmin_(d);
  var parentType = attachType_(d.parentType);
  var parentId = trim_(d.parentId);
  if (!parentId) return { ok: false, error: 'Missing parent record' };
  var fileName = trim_(d.fileName) || 'attachment';
  var mime = trim_(d.mimeType) || 'application/octet-stream';
  var b64 = d.dataBase64 || '';
  if (!b64) return { ok: false, error: 'No file data' };
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, fileName);
    var file = attachmentsFolder_().createFile(blob);   // private by default (owner-only)
    var docType = attachDocType_(d.docType);
    var docDate = trim_(d.docDate) || new Date().toISOString().slice(0, 10);
    var row = {
      AttachmentID: Utilities.getUuid(), ParentType: parentType, ParentID: parentId,
      FileName: fileName, Description: trim_(d.description), DocType: docType, DocDate: docDate,
      IsCurrent: truthy_(d.isCurrent) ? 'yes' : 'no',
      DriveFileID: file.getId(), Url: file.getUrl(), CreatedAt: new Date().toISOString()
    };
    appendRow_(SHEETS.attachments, row);
    if (truthy_(row.IsCurrent)) clearCurrentAttachments_(parentType, parentId, docType, row.AttachmentID);
    return { ok: true, attachment: row };
  } catch (e) { return { ok: false, error: 'Upload failed: ' + e }; }
}
function attachType_(t) { t = trim_(t); return (t === 'invoice' || t === 'counterparty') ? t : 'contract'; }
var DOC_TYPES = ['signed', 'draft', 'annex', 'amendment', 'other'];
function attachDocType_(t) { t = trim_(t).toLowerCase(); return DOC_TYPES.indexOf(t) >= 0 ? t : 'other'; }
function clearCurrentAttachments_(parentType, parentId, docType, keepId) {
  readAll_(SHEETS.attachments).forEach(function (a) {
    if (a.ParentType === parentType && String(a.ParentID) === String(parentId) &&
        trim_(a.DocType) === docType && String(a.AttachmentID) !== String(keepId) && truthy_(a.IsCurrent)) {
      updateRow_(SHEETS.attachments, 'AttachmentID', a.AttachmentID, { IsCurrent: 'no' });
    }
  });
}
function adminUpdateAttachment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.attachments, 'AttachmentID', trim_(d.id));
  if (!a) return { ok: false, error: 'Attachment not found' };
  var upd = {};
  if (d.description !== undefined) upd.Description = trim_(d.description);
  if (d.docType !== undefined) upd.DocType = attachDocType_(d.docType);
  if (d.docDate !== undefined) upd.DocDate = trim_(d.docDate);
  updateRow_(SHEETS.attachments, 'AttachmentID', a.AttachmentID, upd);
  // moving to another type must not leave two "current" files of the same type
  if (upd.DocType && truthy_(a.IsCurrent)) clearCurrentAttachments_(a.ParentType, a.ParentID, upd.DocType, a.AttachmentID);
  return { ok: true };
}
function adminSetCurrentAttachment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.attachments, 'AttachmentID', trim_(d.id));
  if (!a) return { ok: false, error: 'Attachment not found' };
  var makeCurrent = (d.isCurrent === undefined) ? true : truthy_(d.isCurrent);
  updateRow_(SHEETS.attachments, 'AttachmentID', a.AttachmentID, { IsCurrent: makeCurrent ? 'yes' : 'no' });
  if (makeCurrent) clearCurrentAttachments_(a.ParentType, a.ParentID, trim_(a.DocType), a.AttachmentID);
  return { ok: true };
}
function adminListAttachments_(d) {
  requireAdmin_(d);
  var pt = attachType_(d.parentType);
  var pid = trim_(d.parentId);
  var all = readAll_(SHEETS.attachments).filter(function (a) { return a.ParentType === pt && String(a.ParentID) === pid; });
  return { ok: true, attachments: all };
}
function adminDeleteAttachment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.attachments, 'AttachmentID', trim_(d.id));
  if (a && a.DriveFileID) { try { DriveApp.getFileById(a.DriveFileID).setTrashed(true); } catch (e) {} }
  deleteRowsWhere_(SHEETS.attachments, 'AttachmentID', trim_(d.id));
  return { ok: true };
}
function deleteAttachmentsFor_(parentType, parentId) {
  readAll_(SHEETS.attachments).forEach(function (a) {
    if (a.ParentType === parentType && String(a.ParentID) === String(parentId)) {
      if (a.DriveFileID) { try { DriveApp.getFileById(a.DriveFileID).setTrashed(true); } catch (e) {} }
      deleteRowsWhere_(SHEETS.attachments, 'AttachmentID', a.AttachmentID);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Requisites — several sets per counterparty, one marked as default
// ─────────────────────────────────────────────────────────────────────────────
var REQ_FIELDS = ['Label', 'LegalName', 'Jurisdiction', 'RegNumber', 'Address', 'BankName', 'BankAddress',
                  'BeneficiaryName', 'AccountNumber', 'Swift', 'CorrBank', 'CorrSwift', 'SignatoryName', 'SignatoryTitle'];

function adminListRequisites_(d) {
  var cpId = trim_(d.counterpartyId);
  var all = readAll_(SHEETS.requisites);
  return cpId ? all.filter(function (r) { return String(r.CounterpartyID) === cpId; }) : all;
}
function clearDefaults_(cpId, keepId) {
  readAll_(SHEETS.requisites).forEach(function (r) {
    if (String(r.CounterpartyID) === String(cpId) && String(r.RequisiteID) !== String(keepId) && truthy_(r.IsDefault)) {
      updateRow_(SHEETS.requisites, 'RequisiteID', r.RequisiteID, { IsDefault: 'no' });
    }
  });
}
function adminSaveRequisite_(d) {
  requireAdmin_(d);
  var cpId = trim_(d.counterpartyId);
  if (!cpId) return { ok: false, error: 'Counterparty is required' };
  var id = trim_(d.id);
  var vals = {};
  REQ_FIELDS.forEach(function (f) { vals[f] = trim_(d[f.charAt(0).toLowerCase() + f.slice(1)]); });
  if (!vals.Label) vals.Label = vals.BankName || 'Main';
  var existing = adminListRequisites_({ counterpartyId: cpId });
  var makeDefault = truthy_(d.isDefault) || existing.length === 0;   // first set is default automatically

  if (id) {
    var rec = findRow_(SHEETS.requisites, 'RequisiteID', id);
    if (!rec) return { ok: false, error: 'Requisite set not found' };
    vals.IsDefault = makeDefault ? 'yes' : (truthy_(rec.IsDefault) && !truthy_(d.isDefault) ? 'yes' : 'no');
    updateRow_(SHEETS.requisites, 'RequisiteID', id, vals);
    if (truthy_(vals.IsDefault)) clearDefaults_(cpId, id);
    return { ok: true, updated: true };
  }
  var row = { RequisiteID: Utilities.getUuid(), CounterpartyID: cpId, IsDefault: makeDefault ? 'yes' : 'no', CreatedAt: new Date().toISOString() };
  REQ_FIELDS.forEach(function (f) { row[f] = vals[f]; });
  appendRow_(SHEETS.requisites, row);
  if (makeDefault) clearDefaults_(cpId, row.RequisiteID);
  return { ok: true, requisite: row };
}
function adminDeleteRequisite_(d) {
  requireAdmin_(d);
  var rec = findRow_(SHEETS.requisites, 'RequisiteID', trim_(d.id));
  if (!rec) return { ok: false, error: 'Requisite set not found' };
  deleteRowsWhere_(SHEETS.requisites, 'RequisiteID', trim_(d.id));
  // if the default was removed, promote the first remaining set
  if (truthy_(rec.IsDefault)) {
    var rest = adminListRequisites_({ counterpartyId: rec.CounterpartyID });
    if (rest.length) updateRow_(SHEETS.requisites, 'RequisiteID', rest[0].RequisiteID, { IsDefault: 'yes' });
  }
  return { ok: true };
}
function adminSetDefaultRequisite_(d) {
  requireAdmin_(d);
  var rec = findRow_(SHEETS.requisites, 'RequisiteID', trim_(d.id));
  if (!rec) return { ok: false, error: 'Requisite set not found' };
  updateRow_(SHEETS.requisites, 'RequisiteID', rec.RequisiteID, { IsDefault: 'yes' });
  clearDefaults_(rec.CounterpartyID, rec.RequisiteID);
  return { ok: true };
}
function defaultRequisite_(cpId) {
  var list = adminListRequisites_({ counterpartyId: cpId });
  for (var i = 0; i < list.length; i++) if (truthy_(list[i].IsDefault)) return list[i];
  return list.length ? list[0] : null;
}

function addOneYear_(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  var p = dateStr.split('-');
  return (Number(p[0]) + 1) + '-' + p[1] + '-' + p[2];
}
function cpName_(id) { var c = findRow_(SHEETS.counterparties, 'CounterpartyID', trim_(id)); return c ? (c.Name || c.Email || '') : ''; }

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
    OurRole: (trim_(d.direction) === 'outgoing') ? 'customer' : 'supplier',
    SignDate: trim_(d.signDate), StartDate: trim_(d.startDate), EndDate: trim_(d.endDate),
    Amount: num_(d.amount), Currency: currency, PricingType: (trim_(d.pricingType)==='hourly'?'hourly':'lump'), ParentContractID: trim_(d.parentContractId)
  };
}
function adminCreateContract_(d) {
  requireAdmin_(d);
  var f = contractFields_(d);
  var today = new Date().toISOString().slice(0, 10);
  if (!f.SignDate) f.SignDate = today;
  if (!f.StartDate) f.StartDate = today;
  if (!f.EndDate) f.EndDate = addOneYear_(f.StartDate || today);
  var number = trim_(d.number);
  if (!number) number = autoNumber_(SHEETS.contracts, 'SignDate', f.SignDate, 'agr');
  else if (numberTaken_(SHEETS.contracts, number, '', 'ContractID')) return { ok: false, error: 'Contract number already exists' };
  var row = {
    ContractID: Utilities.getUuid(), Number: number, Description: f.Description, CounterpartyID: f.CounterpartyID,
    Direction: f.Direction, OurRole: f.OurRole, SignDate: f.SignDate, StartDate: f.StartDate, EndDate: f.EndDate,
    Amount: f.Amount, Currency: f.Currency, PricingType: f.PricingType, AmountUSD: '', FxRate: '', FxAsOf: '',
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
    Number: number, Description: f.Description, CounterpartyID: f.CounterpartyID, Direction: f.Direction, OurRole: f.OurRole,
    SignDate: f.SignDate, StartDate: f.StartDate, EndDate: f.EndDate, Amount: f.Amount, Currency: f.Currency,
    AmountUSD: cfx.AmountUSD, FxRate: cfx.FxRate, FxAsOf: cfx.FxAsOf,
    PricingType: f.PricingType, ParentContractID: f.ParentContractID
  });
  return { ok: true };
}
// ─────────────────────────────────────────────────────────────────────────────
// OCR extraction from an attached scan — uses Google Drive's built-in OCR
// (the file is copied to a temporary Google Doc inside the owner's Drive, read,
// then the temporary copy is deleted). Nothing leaves the Google account.
// ─────────────────────────────────────────────────────────────────────────────
function ocrText_(driveFileId) {
  var token = ScriptApp.getOAuthToken();
  var copyUrl = 'https://www.googleapis.com/drive/v3/files/' + driveFileId + '/copy?ocrLanguage=en&supportsAllDrives=true';
  var resp = UrlFetchApp.fetch(copyUrl, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ name: 'FXWorks OCR temp', mimeType: 'application/vnd.google-apps.document' }),
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) return { ok: false, error: 'OCR copy failed: ' + resp.getContentText().slice(0, 200) };
  var docId = JSON.parse(resp.getContentText()).id;
  try {
    var ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=text/plain',
      { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    var text = (ex.getResponseCode() === 200) ? ex.getContentText() : '';
    return { ok: true, text: text };
  } finally {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) {}
  }
}

function normNum_(str) { return Number(String(str).replace(/[  ,](?=\d{3}\b)/g, '').replace(/\s/g, '').replace(/,(?=\d{2}$)/, '.')) || 0; }

var MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
function parseDates_(text) {
  var out = [];
  var re1 = /(\d{4})-(\d{2})-(\d{2})/g, m;
  while ((m = re1.exec(text))) out.push({ iso: m[0], at: m.index });
  var re2 = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/g;
  while ((m = re2.exec(text))) out.push({ iso: m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]), at: m.index });
  var re3 = /(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/g;
  while ((m = re3.exec(text))) { var mo = MONTHS[m[2].toLowerCase()]; if (mo) out.push({ iso: m[3] + '-' + pad2_(mo) + '-' + pad2_(m[1]), at: m.index }); }
  var re4 = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/g;
  while ((m = re4.exec(text))) { var mo2 = MONTHS[m[1].toLowerCase()]; if (mo2) out.push({ iso: m[3] + '-' + pad2_(mo2) + '-' + pad2_(m[2]), at: m.index }); }
  return out;
}
function pad2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function nearestDate_(dates, text, words) {
  var best = null, bestDist = 1e9;
  words.forEach(function (w) {
    var re = new RegExp(w, 'ig'), m;
    while ((m = re.exec(text))) {
      dates.forEach(function (d) {
        var dist = Math.abs(d.at - m.index);
        if (dist < bestDist && dist < 300) { bestDist = dist; best = d.iso; }
      });
    }
  });
  return best;
}
function nearNumber_(text, words, maxDist) {
  var best = null, bestDist = maxDist || 250;
  var re = /(?:within|not exceed|exceed|of)\s+(?:[a-z\- ]+\()?(\d{1,3})\)?\s*(?:calendar |business |working )?days?/ig, m;
  var hits = [];
  while ((m = re.exec(text))) hits.push({ v: m[1], at: m.index });
  words.forEach(function (w) {
    var rw = new RegExp(w, 'ig'), k;
    while ((k = rw.exec(text))) {
      hits.forEach(function (h) {
        var d = Math.abs(h.at - k.index);
        if (d < bestDist) { bestDist = d; best = h.v; }
      });
    }
  });
  return best;
}


// ── Recognise the counterparty, the pricing model and the direction ─────────────
function normName_(t) {
  return String(t || '').toLowerCase()
    .replace(/\b(ltd|llc|limited|fzco|fze|llp|inc|gmbh|co|company|sar|hong kong)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function guessCounterparty_(text) {
  var t = normName_(text), best = null, bestLen = 0;
  readAll_(SHEETS.counterparties).forEach(function (c) {
    var n = normName_(c.Name);
    if (n.length < 4) return;
    if (/fraktalex/i.test(c.Name || '')) return;          // that is us, not the counterparty
    if (t.indexOf(n) >= 0 && n.length > bestLen) { best = c; bestLen = n.length; }
  });
  return best;
}
function guessPricing_(text) {
  return /(per\s+hour|hourly\s+rate|per\s+man[- ]hour|\/\s*hour|\bper\s*hr\b)/i.test(text) ? 'hourly' : 'lump';
}
function hourlyRate_(text) {
  var re = /(?:(USD|EUR|AED|SGD)\s*)?([\d][\d ,.]{0,12})\s*(?:(USD|EUR|AED|SGD)\s*)?(?:per\s+hour|\/\s*hour|hourly|per\s*hr)/ig, m, out = null;
  while ((m = re.exec(text))) {
    var v = normNum_(m[2]);
    if (v > 0 && (!out || v > out.amount)) out = { amount: v, currency: (m[1] || m[3] || '').toUpperCase() };
  }
  return out;
}
// Which side are we? If Fraktalex is named as Supplier/Service Provider we receive money.
function guessDirection_(text) {
  // An Independent Contractor Agreement always means we pay the contractor.
  if (/independent\s+contractor\s+agreement/i.test(text)) return 'outgoing';
  var us = /fraktalex/i.exec(text);
  if (!us) return '';
  var roles = [
    { re: /supplier|service provider|contractor|consultant/ig, dir: 'incoming' },
    { re: /customer|client|purchaser/ig, dir: 'outgoing' }
  ];
  var best = null, bestDist = 400, m;
  roles.forEach(function (r) {
    r.re.lastIndex = 0;
    while ((m = r.re.exec(text))) {
      var d = Math.abs(m.index - us.index);
      if (d < bestDist) { bestDist = d; best = r.dir; }
    }
  });
  return best || '';
}

function parseContractText_(text) {
  var f = {};
  var num = text.match(/(?:agreement|contract)\s*(?:no\.?|number|#|\u2116)\s*([A-Za-z0-9\/\-\._]{3,40})/i);
  if (num) f.number = num[1].replace(/[.,;]+$/, '').trim();

  var cur = null, amount = 0;
  var reA = /(?:(USD|EUR|AED|SGD)\s*([\d][\d ,.]{2,})|([\d][\d ,.]{2,})\s*(USD|EUR|AED|SGD))/gi, m;
  while ((m = reA.exec(text))) {
    var c = (m[1] || m[4] || '').toUpperCase(), v = normNum_(m[2] || m[3]);
    if (v > amount) { amount = v; cur = c; }
  }
  if (amount) { f.amount = amount; f.currency = cur; }

  f.pricingType = guessPricing_(text);
  if (f.pricingType === 'hourly') {
    var hr = hourlyRate_(text);
    if (hr) { f.amount = hr.amount; if (hr.currency) f.currency = hr.currency; }
  }
  if (/independent\s+contractor\s+agreement/i.test(text)) f.templateType = 'ica';
  var dir = guessDirection_(text);
  if (dir) f.direction = dir;
  var cp = guessCounterparty_(text);
  if (cp) { f.counterpartyId = cp.CounterpartyID; f.counterpartyName = cp.Name; }

  var dates = parseDates_(text);
  if (dates.length) {
    f.signDate  = nearestDate_(dates, text, ['dated', 'date of signature', 'signed on', 'signature']) || dates[0].iso;
    f.startDate = nearestDate_(dates, text, ['commencing', 'start date', 'effective date', 'comes into effect']) || f.signDate;
    f.endDate   = nearestDate_(dates, text, ['no later than', 'until', 'expiry', 'end date', 'valid till', 'in force till']);
  }
  return f;
}

// Extra terms recognised in the text — shown to the admin for reference, never written automatically.
function parseContractExtras_(text) {
  var x = {};
  var v;
  v = nearNumber_(text, ['payment', 'shall be paid', 'paid within', 'due']);              if (v) x.paymentDays = v;
  v = nearNumber_(text, ['acceptance procedure', 'deemed accepted', 'acceptance']);        if (v) x.acceptanceDays = v;
  v = nearNumber_(text, ['remarks', 'comments']);                                          if (v) x.remarksDays = v;
  v = nearNumber_(text, ['notice', 'terminate', 'termination']);                           if (v) x.noticeDays = v;

  var w = text.match(/warranty[^.]{0,60}?((?:\d+(?:[.,]\d+)?)\s*(?:\([^)]{0,40}\)\s*)?(?:months?|years?|weeks?))/i);
  if (w) x.warrantyPeriod = w[1].replace(/\s+/g, ' ').trim();

  var law = text.match(/law(?:s)?\s+(?:in force\s+)?(?:of|in)\s+([A-Z][A-Za-z .\-]{2,40}?)(?:\s*,|\s+without|\s+and|\.|\n)/);
  if (law) x.governingLaw = law[1].trim();

  var jur = text.match(/([A-Z][A-Za-z .\-]{2,40}?)\s+shall be the place of jurisdiction/);
  if (jur) x.jurisdictionPlace = jur[1].trim();

  var arb = text.match(/(arbitration[^.]{0,120}?(?:Centre|Center|Institute|Chamber|Court)[A-Za-z ()]*)/i);
  if (arb) x.arbitrationBody = arb[1].replace(/\s+/g, ' ').trim();

  var pen = [];
  var rp = /(\d+(?:[.,]\d+)?)\s*(?:%|per cent)/gi, pm;
  while ((pm = rp.exec(text))) { if (pen.indexOf(pm[1]) < 0) pen.push(pm[1]); }
  if (pen.length) x.percentagesFound = pen.slice(0, 6).join(', ') + ' %';

  var parties = [];
  var rpa = /([A-Z][A-Za-z0-9 .,&\-]{3,60}?)\s*[-\u2013]?\s*(?:hereafter|hereinafter)\s+referred to as/g, pa;
  while ((pa = rpa.exec(text))) { var nm = pa[1].trim(); if (nm.length > 3 && parties.indexOf(nm) < 0) parties.push(nm); }
  if (parties.length) x.parties = parties.slice(0, 3).join(' | ');

  return x;
}

// Merge fields recognised in several documents of one contract.
// The main (signed) document wins for the number, dates and roles;
// an annex / SOW wins for the price, because that is where it normally lives.
function mergeContractFields_(parts) {
  var main = [], annex = [];
  parts.forEach(function (p) { (p.docType === 'annex' || p.docType === 'amendment' ? annex : main).push(p.fields || {}); });
  function pick(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i][key] !== undefined && list[i][key] !== '' && list[i][key] !== null) return list[i][key];
    return undefined;
  }
  var out = {};
  ['number', 'signDate', 'startDate', 'pricingType', 'direction', 'counterpartyId', 'counterpartyName', 'templateType'].forEach(function (k) {
    var v = pick(main, k); if (v === undefined) v = pick(annex, k);
    if (v !== undefined) out[k] = v;
  });
  ['amount', 'currency', 'endDate'].forEach(function (k) {
    var v = pick(annex, k); if (v === undefined) v = pick(main, k);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

function adminExtractContract_(d) {
  requireAdmin_(d);
  var ids = d.attachmentIds;
  if (typeof ids === 'string') ids = ids.split(',');
  if (!ids || !ids.length) ids = [trim_(d.attachmentId)];
  ids = ids.map(trim_).filter(String);
  if (!ids.length) return { ok: false, error: 'Select at least one document' };

  var parts = [], notes = [];
  for (var i = 0; i < ids.length; i++) {
    var a = findRow_(SHEETS.attachments, 'AttachmentID', ids[i]);
    if (!a || !a.DriveFileID) { notes.push('File not found'); continue; }
    var r = ocrText_(a.DriveFileID);
    if (!r.ok) { notes.push(a.FileName + ': ' + r.error); continue; }
    var text = String(r.text || '');
    if (text.replace(/\s/g, '').length < 40) { notes.push(a.FileName + ': no readable text'); continue; }
    var f = parseContractText_(text);
    parts.push({ docType: trim_(a.DocType), fileName: a.FileName, fields: f, extras: parseContractExtras_(text) });
    notes.push(a.FileName + ': ' + (Object.keys(f).length ? Object.keys(f).join(', ') : 'nothing recognised'));
  }
  if (!parts.length) return { ok: false, error: notes.join('; ') || 'Nothing could be read' };
  var extras = {};
  parts.forEach(function (p) { for (var k in (p.extras || {})) if (extras[k] === undefined) extras[k] = p.extras[k]; });
  var merged = mergeContractFields_(parts);
  if (!merged.number && !merged.amount && !merged.signDate) return { ok: false, error: 'Text was read, but no contract details were recognised' };
  return { ok: true, fields: merged, extras: extras, notes: notes };
}

// Upload a file straight into Drive and OCR it before the contract record exists.
// The file stays in the attachments folder and is linked to the contract on save.
function adminExtractUpload_(d) {
  requireAdmin_(d);
  var fileName = trim_(d.fileName) || 'attachment';
  var mime = trim_(d.mimeType) || 'application/octet-stream';
  if (!d.dataBase64) return { ok: false, error: 'No file data' };
  var file;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(d.dataBase64), mime, fileName);
    file = attachmentsFolder_().createFile(blob);
  } catch (e) { return { ok: false, error: 'Upload failed: ' + e }; }

  var res = { ok: true, driveFileId: file.getId(), url: file.getUrl(), fileName: fileName, docType: attachDocType_(d.docType), fields: {} };
  var r = ocrText_(file.getId());
  if (!r.ok) { res.warning = r.error; return res; }
  var text = String(r.text || '');
  if (text.replace(/\s/g, '').length < 40) { res.warning = 'No readable text found in this file (a low-quality scan?)'; return res; }
  res.fields = parseContractText_(text);
  res.extras = parseContractExtras_(text);
  if (!res.fields.number && !res.fields.amount && !res.fields.signDate) res.warning = 'Text was read, but no contract details were recognised';
  return res;
}

// Link a file that is already in Drive (uploaded during contract creation) to a record.
function adminAttachExisting_(d) {
  requireAdmin_(d);
  var parentType = attachType_(d.parentType), parentId = trim_(d.parentId);
  var driveId = trim_(d.driveFileId);
  if (!parentId || !driveId) return { ok: false, error: 'Missing record or file' };
  var docType = attachDocType_(d.docType);
  var row = {
    AttachmentID: Utilities.getUuid(), ParentType: parentType, ParentID: parentId,
    FileName: trim_(d.fileName) || 'attachment', Description: trim_(d.description),
    DocType: docType, DocDate: trim_(d.docDate) || new Date().toISOString().slice(0, 10),
    IsCurrent: truthy_(d.isCurrent) ? 'yes' : 'no',
    DriveFileID: driveId, Url: trim_(d.url), CreatedAt: new Date().toISOString()
  };
  appendRow_(SHEETS.attachments, row);
  if (truthy_(row.IsCurrent)) clearCurrentAttachments_(parentType, parentId, docType, row.AttachmentID);
  return { ok: true, attachment: row };
}

var DOC_TEXT_FIELDS = ['TemplateType', 'OurRole', 'OurRequisiteID', 'TheirRequisiteID', 'Subject',
  'PaymentOption', 'PaymentDays', 'AdvancePercent', 'AdvanceDays', 'GoverningLaw', 'JurisdictionPlace',
  'ArbitrationBody', 'ArbitrationSeat', 'RemarksDays', 'AcceptanceDays', 'EvaluationDays', 'DisputeDays',
  'CureDays', 'NoticeDays', 'TermYears', 'WarrantyPeriod', 'PenaltyDelayPercent', 'PenaltyFailurePercent',
  'PenaltyCapPercent', 'InsuranceAmount', 'RestrictedTerritories', 'RateAmount', 'RateBasis',
  'InvoiceTrigger', 'PaymentBasis', 'ReportFrequency', 'CompletionDate', 'PMName', 'SowScope', 'ExtractedAt'];
var DOC_FLAGS = ['OptAcceptanceAct', 'OptPenalties', 'OptUsageRights', 'OptInsurance', 'OptDataSecurity', 'OptWarranty', 'OptPayoutCurrency', 'ExternalForm'];

function adminSaveContractDoc_(d) {
  requireAdmin_(d);
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.id));
  if (!c) return { ok: false, error: 'Contract not found' };
  var upd = {};
  DOC_TEXT_FIELDS.forEach(function (f) {
    var key = f.charAt(0).toLowerCase() + f.slice(1);
    if (d[key] !== undefined) upd[f] = trim_(d[key]);
  });
  DOC_FLAGS.forEach(function (f) {
    var key = f.charAt(0).toLowerCase() + f.slice(1);
    if (d[key] !== undefined) upd[f] = truthy_(d[key]) ? 'yes' : 'no';
  });
  // A payment term tied to the warranty period requires the warranty block to stay on.
  if (trim_(upd.PaymentOption || c.PaymentOption) === 'after_warranty' &&
      (upd.OptWarranty === 'no' || (upd.OptWarranty === undefined && !truthy_(c.OptWarranty)))) {
    return { ok: false, error: 'Payment "after warranty period" requires the Warranty block to be enabled' };
  }
  // Our role and the money direction are two views of the same fact — keep them in step.
  if (upd.OurRole) upd.Direction = (upd.OurRole === 'customer') ? 'outgoing' : 'incoming';
  updateRow_(SHEETS.contracts, 'ContractID', c.ContractID, upd);
  return { ok: true };
}

function adminDeleteContract_(d) {
  requireAdmin_(d);
  var id = trim_(d.id);
  // Clear references so nothing dangles.
  readAll_(SHEETS.projects).forEach(function (p) { if (String(p.ContractID) === id) updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, { ContractID: '' }); });
  readAll_(SHEETS.contracts).forEach(function (c) { if (String(c.ParentContractID) === id) updateRow_(SHEETS.contracts, 'ContractID', c.ContractID, { ParentContractID: '' }); });
  readAll_(SHEETS.invoices).forEach(function (v) { if (String(v.ContractID) === id) updateRow_(SHEETS.invoices, 'InvoiceID', v.InvoiceID, { ContractID: '' }); });
  deleteAttachmentsFor_('contract', id);
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
  deleteAttachmentsFor_('invoice', trim_(d.id));
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
  var contractId = trim_(d.contractId), counterpartyId = trim_(d.counterpartyId);
  if (contractId) { var ct = findRow_(SHEETS.contracts, 'ContractID', contractId); if (ct) counterpartyId = trim_(ct.CounterpartyID); }
  if (!counterpartyId) return { ok: false, error: 'Select a counterparty' };
  var now = new Date().toISOString();
  var row = { ProjectID: Utilities.getUuid(), Name: name, Customer: cpName_(counterpartyId), CounterpartyID: counterpartyId, Description: trim_(d.description), ContractID: contractId, CreatedAt: now, UpdatedAt: now };
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
  var contractId = trim_(d.contractId), counterpartyId = trim_(d.counterpartyId);
  if (contractId) { var ct = findRow_(SHEETS.contracts, 'ContractID', contractId); if (ct) counterpartyId = trim_(ct.CounterpartyID); }
  if (!counterpartyId) return { ok: false, error: 'Select a counterparty' };
  var customer = cpName_(counterpartyId), desc = trim_(d.description);
  updateRow_(SHEETS.projects, 'ProjectID', p.ProjectID, {
    Name: name, Customer: customer, CounterpartyID: counterpartyId, Description: desc, ContractID: contractId, UpdatedAt: new Date().toISOString()
  });
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
  // The rate comes either from one of the counterparty's contracts or from the counterparty card.
  var contractId = trim_(d.contractId), rateSource = 'counterparty', pricing = 'hourly';
  var rate = num_(cp.Rate);
  var currency = CURRENCIES.indexOf(trim_(cp.Currency)) >= 0 ? trim_(cp.Currency) : 'USD';
  if (contractId) {
    var ct = findRow_(SHEETS.contracts, 'ContractID', contractId);
    if (!ct) return { ok: false, error: 'Contract not found' };
    if (String(ct.CounterpartyID) !== String(cp.CounterpartyID)) return { ok: false, error: 'That contract belongs to another counterparty' };
    rateSource = 'contract';
    pricing = (trim_(ct.PricingType) === 'lump') ? 'lump' : 'hourly';
    currency = CURRENCIES.indexOf(trim_(ct.Currency)) >= 0 ? trim_(ct.Currency) : currency;
    rate = num_(ct.Amount);          // hourly: rate per hour; lump: the total contract amount
  }
  var comment = trim_(d.comment), title = trim_(d.title), now = new Date().toISOString();
  var row = {
    AssignmentID: Utilities.getUuid(), ProjectID: p.ProjectID, ProjectName: p.Name, Customer: p.Customer, ProjectDescription: p.Description,
    EmployeeEmail: email, EmployeeName: cp.Name || '', Title: title, Currency: currency, Rate: (pricing === 'lump' ? '' : rate),
    Comment: comment, LastNotifiedComment: comment, Status: 'released',
    ReportedHours: '', ReportedAmount: (pricing === 'lump' ? rate : ''),
    ReleasedAt: now, SubmittedAt: '', UpdatedAt: now, CreatedAt: now,
    ContractID: contractId, RateSource: rateSource, PricingType: pricing
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
  a.AllowPayoutCurrency = payoutAllowed_(a) ? 'yes' : 'no';
  return { ok: true, assignment: a, items: items };
}

function adminSaveReport_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a) return { ok: false, error: 'Report not found' };
  var activities = (Array.isArray(d.activities) ? d.activities : []).map(function (x) { return trim_(x); }).filter(function (x) { return x; });
  var lump = (trim_(a.PricingType) === 'lump');
  var hours = lump ? '' : num_(d.hours);
  var rate = num_(a.Rate);
  var amount = lump ? ((a.ReportedAmount === '' || a.ReportedAmount == null) ? '' : num_(a.ReportedAmount)) : round2_(num_(d.hours) * rate);
  var now = new Date().toISOString();
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
  if (d.payoutCurrency !== undefined) upd.PayoutCurrency = payoutCur_(d.payoutCurrency);
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

var PAYOUT_CURRENCIES = ['EUR', 'USD', 'AED', 'SGD'];
// The contractor may pick a payout currency when their OWN contract with us (an ICA)
// allows it — not the contract the project happens to be linked to.
function payoutAllowed_(a) {
  var cp = findRow_(SHEETS.counterparties, 'Email', normEmail_(a.EmployeeEmail));
  if (!cp) return false;
  var allowed = false;
  readAll_(SHEETS.contracts).forEach(function (c) {
    if (allowed) return;
    if (String(c.CounterpartyID) !== String(cp.CounterpartyID)) return;
    if (trim_(c.TemplateType) !== 'ica') return;
    if (truthy_(c.OptPayoutCurrency)) allowed = true;
  });
  return allowed;
}
function payoutCur_(c) { c = trim_(c).toUpperCase(); return PAYOUT_CURRENCIES.indexOf(c) >= 0 ? c : ''; }

// Countersigning the report = acceptance and the trigger for payment (ICA clauses 3.2-3.4).
function adminAcceptAssignment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  if (a.Status !== 'submitted') return { ok: false, error: 'Only a submitted report can be accepted' };
  var revoke = truthy_(d.revoke);
  if (revoke) {
    updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { AcceptedBy: '', AcceptedAt: '', UpdatedAt: new Date().toISOString() });
    return { ok: true, revoked: true };
  }
  var by = trim_(d.acceptedBy);
  if (!by) return { ok: false, error: 'Enter the name of the person accepting the report' };
  var date = trim_(d.acceptedAt) || new Date().toISOString().slice(0, 10);
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { AcceptedBy: by, AcceptedAt: date, UpdatedAt: new Date().toISOString() });
  return { ok: true, acceptedBy: by, acceptedAt: date };
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
  rows.forEach(function (r) { r.AllowPayoutCurrency = payoutAllowed_(r) ? 'yes' : 'no'; });
  return { ok: true, email: email, assignments: rows };
}
function employeeGet_(d) {
  var emp = verifyEmployee_(d);
  if (!emp) return { ok: false, error: 'Invalid email or password' };
  var a = findRow_(SHEETS.assignments, 'AssignmentID', d.assignmentId);
  if (!a || normEmail_(a.EmployeeEmail) !== normEmail_(d.email)) return { ok: false, error: 'No access to this report' };
  if (a.Status === 'recalled') return { ok: false, error: 'This task was recalled by the admin' };
  var items = readAll_(SHEETS.entries).filter(function (r) { return r.AssignmentID === a.AssignmentID; });
  a.AllowPayoutCurrency = payoutAllowed_(a) ? 'yes' : 'no';
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
  var lump = (trim_(a.PricingType) === 'lump');
  var hours = lump ? '' : num_(d.hours);
  if (finalize && !activities.length) return { ok: false, error: 'Add at least one activity' };
  if (finalize && !lump && num_(d.hours) <= 0) return { ok: false, error: 'Enter the total hours' };

  var rate = num_(a.Rate);
  var amount = lump ? ((a.ReportedAmount === '' || a.ReportedAmount == null) ? '' : num_(a.ReportedAmount)) : round2_(num_(d.hours) * rate);
  var now = new Date().toISOString();
  deleteRowsWhere_(SHEETS.entries, 'AssignmentID', a.AssignmentID);
  activities.forEach(function (desc) {
    appendRow_(SHEETS.entries, {
      EntryID: Utilities.getUuid(), AssignmentID: a.AssignmentID, ProjectID: a.ProjectID,
      ProjectName: a.ProjectName, EmployeeEmail: normEmail_(d.email), ActivityDescription: desc, CreatedAt: now
    });
  });
  var sub = trim_(d.submittedDate);
  var upd = { ReportedHours: hours, ReportedAmount: amount, SubmittedAt: sub, UpdatedAt: now };
  if (d.payoutCurrency !== undefined && payoutAllowed_(a)) upd.PayoutCurrency = payoutCur_(d.payoutCurrency);
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
var TEXT_COLS = ['Number', 'RegNumber', 'AccountNumber', 'Swift', 'CorrSwift', 'Phone', 'Title', 'FileName'];
function appendRow_(name, obj) {
  var sh = getSheet_(name), head = HEADERS[keyByName_(name)];
  var arr = head.map(function (h) { return obj[h] != null ? obj[h] : ''; });
  sh.appendRow(arr);
  // Keep dates and reference numbers as text — otherwise Sheets turns "2515-1" into a date.
  var r = sh.getLastRow();
  for (var i = 0; i < arr.length; i++) {
    var isDate = (typeof arr[i] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(arr[i]));
    var isRef = (typeof arr[i] === 'string' && arr[i] !== '' && TEXT_COLS.indexOf(head[i]) >= 0);
    if (isDate || isRef) {
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
          // Keep dates and reference numbers as text (Sheets would otherwise parse "2515-1" as a date).
          if (typeof val === 'string' && val !== '' &&
              (/^\d{4}-\d{2}-\d{2}$/.test(val) || TEXT_COLS.indexOf(key) >= 0)) cell.setNumberFormat('@');
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
    var url = 'https://api.frankfurter.dev/v1/' + d + '?base=' + encodeURIComponent(currency) + '&symbols=USD';
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

// Run this from the Apps Script editor and copy the Execution log.
// It calls the rate service directly and reports the exact HTTP status / error.
function testFx() {
  var out = [];
  var url = 'https://api.frankfurter.dev/v1/2025-06-02?base=EUR&symbols=USD';
  out.push('URL: ' + url);
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    out.push('HTTP ' + resp.getResponseCode());
    out.push('BODY ' + String(resp.getContentText()).slice(0, 400));
  } catch (e) {
    out.push('EXCEPTION: ' + e);
  }
  var s = out.join('\n');
  Logger.log(s);
  return s;
}

function setup() {
  getSheet_(SHEETS.counterparties); getSheet_(SHEETS.requisites); getSheet_(SHEETS.employees); getSheet_(SHEETS.contracts); getSheet_(SHEETS.invoices); getSheet_(SHEETS.attachments); getSheet_(SHEETS.projects); getSheet_(SHEETS.assignments); getSheet_(SHEETS.entries);
  ensureCounterparties_();
  SpreadsheetApp.getActive().toast('Sheets created.');
}
