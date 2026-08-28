/**
 * Fraktalex — Reporting collection system
 * Backend: Google Apps Script (Web App) + Google Sheets as storage.
 * Deployment: see SETUP.md
 */

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS — fill in before deployment
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  ADMIN_PASSCODE: 'Z@p15Duny',
  EMPLOYEE_BASE_URL: 'https://kotomotozilla.github.io/FXWorks/employee.html',
  ADMIN_BASE_URL:    'https://kotomotozilla.github.io/FXWorks/admin.html',
  // Admin email for "report ready" notifications.
  // If empty — the script owner's address is used.
  ADMIN_EMAIL: 'info@fraktalex.com',
  SHEET_ID: '',
  COMPANY_NAME: 'Fraktalex Limited',
  // Who signs for the company unless someone else is named at generation time
  DEFAULT_SIGNATORY: 'Konstantin Maiorov',
  DEFAULT_SIGNATORY_TITLE: 'Director',
  // Who may sign for the company. Add or change names here.
  SIGNATORIES: [
    { name: 'Konstantin Maiorov', title: 'Director' },
    { name: 'Elena Bigzaeva',     title: 'Director (PoA)' }
  ]
};

// Bump this on every backend change so the admin panel can confirm the new code is deployed.
const BUILD = '2026-08-08.101';

// ─────────────────────────────────────────────────────────────────────────────
const SHEETS = { documents: 'Documents2', blocks: 'Blocks2', terms: 'ContractTerms2', payments: 'Payments', counterparties: 'Counterparties', requisites: 'Requisites', employees: 'Employees', contracts: 'Contracts', invoices: 'Invoices', attachments: 'Attachments', projects: 'Projects', assignments: 'Assignments', entries: 'Entries' };

const HEADERS = {
  counterparties: ['CounterpartyID', 'Name', 'Type', 'Address', 'Email', 'Phone', 'Password', 'HasReportingAccess', 'Rate', 'Currency', 'RateContractID', 'CreatedAt'],
  documents:   ['DocumentID', 'ContractID', 'Kind', 'Number', 'SignDate', 'EffectiveFrom', 'Status', 'Source',
                'AttachmentID', 'FileName', 'Profile', 'Notes', 'Snapshot', 'CreatedAt'],
  payments:    ['PaymentID', 'CounterpartyID', 'PaidAt', 'Amount', 'Currency', 'Reference', 'Note',
                'AssignmentID', 'MatchedBy', 'MatchedAt', 'CreatedAt'],
  terms:       ['TermID', 'ContractID', 'Field', 'Value', 'ValidFrom', 'FromClause', 'DocumentID', 'Note', 'CreatedAt'],
  blocks:      ['BlockID', 'DocumentID', 'ContractID', 'SemanticKey', 'Path', 'ReplacesPath', 'ReplacesIn', 'ReplacementText', 'Level', 'Title', 'Text', 'Params', 'Origin', 'SortOrder', 'CreatedAt'],
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
                'OptPayoutCurrency', 'ExternalForm', 'ExtractedAt', 'PricingType',
                'OptUplift', 'UpliftBase', 'UpliftK1Min', 'UpliftK1Max', 'UpliftK2Min', 'UpliftK2Max',
                'UpliftK3Min', 'UpliftK3Max', 'UpliftNumber', 'UpliftDate', 'UpliftFrom'],
  invoices:    ['InvoiceID', 'Number', 'ContractID', 'CounterpartyID', 'InvoiceDate', 'DueDate',
                'Amount', 'Currency', 'AmountUSD', 'FxRate', 'FxAsOf', 'CreatedAt'],
  attachments: ['AttachmentID', 'ParentType', 'ParentID', 'FileName', 'Description', 'DocType', 'DocDate', 'IsCurrent', 'DriveFileID', 'Url', 'CreatedAt'],
  projects:    ['ProjectID', 'Name', 'Customer', 'CounterpartyID', 'Description', 'ContractID', 'CreatedAt', 'UpdatedAt'],
  assignments: ['AssignmentID', 'ProjectID', 'ProjectName', 'Customer', 'ProjectDescription', 'EmployeeEmail', 'EmployeeName',
                'Title', 'Currency', 'Rate', 'Comment', 'LastNotifiedComment', 'Status', 'ReportedHours', 'ReportedAmount',
                'ReleasedAt', 'SubmittedAt', 'UpdatedAt', 'CreatedAt', 'PayoutCurrency', 'AcceptedBy', 'AcceptedTitle', 'AcceptedAt',
                'ContractID', 'RateSource', 'PricingType',
                'UpliftGranted', 'UpliftBase', 'UpliftK1', 'UpliftK2', 'UpliftK3',
                'UpliftPercent', 'UpliftAmount', 'UpliftNote', 'UpliftSetBy', 'UpliftSetAt'],
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
  var t0 = Date.now();
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var res = route_(body.action, body);
    // how long the server itself took — anything beyond this is network or the browser
    if (res && typeof res === 'object') res.serverMs = Date.now() - t0;
    return jsonOut_(res, e);
  } catch (err) { return jsonOut_({ ok: false, error: String(err && err.message || err), serverMs: Date.now() - t0 }, e); }
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
    case 'get_settings':       requireAdmin_(d); return { ok: true, settings: appSettings_() };
    case 'save_settings':      return adminSaveSettings_(d);
    case 'generate_contract':  return adminGenerateContract_(d);
    case 'signing_defaults':   return adminSigningDefaults_(d);
    // Contracts 2.0 — clause-level structure (experimental, separate sheets)
    case 'v2_parse':           return v2Parse_(d);
    case 'v2_parse_upload':    return v2ParseUpload_(d);
    case 'v2_list':            requireAdmin_(d); return v2List_(d);
    case 'v2_delete_doc':      return v2DeleteDoc_(d);
    case 'v2_set_key':         return v2SetKey_(d);
    case 'v2_set_replaces':    return v2SetReplaces_(d);
    case 'v2_set_doc':         return v2SetDoc_(d);
    case 'v2_save_block':      return v2SaveBlock_(d);
    case 'v2_add_block':       return v2AddBlock_(d);
    case 'v2_delete_block':    return v2DeleteBlock_(d);
    case 'v2_generate':        return v2Generate_(d);
    case 'v2_extract_params':  return v2ExtractParams_(d);
    case 'v2_log_terms':       return v2LogTerms_(d);
    case 'v2_build_history':   return v2BuildHistory_(d);
    case 'v2_save_template':   return v2SaveTemplate_(d);
    case 'v2_templates':       requireAdmin_(d); return { ok: true, templates: v2Templates_() };
    case 'v2_from_template':   return v2FromTemplate_(d);
    case 'v2_terms':           requireAdmin_(d); return { ok: true, terms: v2TermsOf_(trim_(d.contractId)) };
    case 'extract_contract':   return adminExtractContract_(d);
    case 'extract_upload':     return adminExtractUpload_(d);
    case 'attachment_data':    return adminAttachmentData_(d);
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
    case 'cost_report':        requireAdmin_(d); return costReport_(d);
    case 'parse_statement':    return adminParseStatement_(d);
    case 'match_payments':     requireAdmin_(d); return matchPayments_(d);
    case 'save_payments':      return adminSavePayments_(d);
    case 'list_payments':      requireAdmin_(d); return { ok: true, payments: paymentsOf_(trim_(d.counterpartyId)) };
    case 'unmatch_payment':    return adminUnmatchPayment_(d);
    case 'delete_payments':    return adminDeletePayments_(d);
    case 'list_projects':      requireAdmin_(d); return { ok: true, projects: readAll_(SHEETS.projects), assignments: readAll_(SHEETS.assignments) };
    case 'orphan_reports':     requireAdmin_(d); return orphanReports_();
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
    case 'accept_defaults':    return adminAcceptDefaults_(d);
    case 'uplift_settings':    requireAdmin_(d); return upliftFor_(d);
    case 'set_uplift':         return adminSetUplift_(d);
    case 'delete_assignment':  return adminDeleteAssignment_(d);
    case 'admin_get_report':   return adminGetReport_(d);
    case 'admin_save_report':  return adminSaveReport_(d);
    case 'report_rate_options': requireAdmin_(d); return reportRateOptions_(d);
    case 'set_report_rate':    return adminSetReportRate_(d);
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
// Contracts 2.0 — a contract as an ordered set of clause blocks.
// Amendments carry the full new text of a clause; the effective version is the
// latest signed block for each semantic key. Stored in its own sheets, so the
// existing contract module is untouched.
// ─────────────────────────────────────────────────────────────────────────────
// Parsing profiles: hints for document shapes the plain prompt handles badly.
// Not model training — the model is fixed; this is accumulated knowledge about layouts.
var PARSE_PROFILES = {
  '': '',
  bilingual: 'The document is bilingual, often in two columns or with paired paragraphs. ' +
             'Parse the ENGLISH text only; ignore the other language entirely. ' +
             'OCR may interleave the columns — reassemble each clause from the English fragments.',
  unnumbered: 'The document has few or no clause numbers. Derive the address from the section heading ' +
              'and the position of the item inside it: "3.1", "3.2" under the third heading.',
  articles: 'Numbering uses "Article IV", "Section 2.3" or roman numerals. Keep that exact form in path.',
  scanned: 'This is a scan: expect broken characters and stray line breaks. Repair obvious OCR damage ' +
           'in the text you return, but never invent wording that is not there.',
  table: 'Much of the content sits in tables. Turn each table row that carries an obligation into its own ' +
         'clause; keep the row label as the title.'
};

var SEMANTIC_KEYS = ['parties', 'definitions', 'documents', 'scope', 'reporting', 'schedule',
  'acceptance.procedure', 'acceptance.deemed', 'documentation', 'payment.term', 'payment.currency',
  'force_majeure', 'liability.general', 'liability.penalties', 'liability.cap', 'ip.ownership', 'ip.usage',
  'infringement', 'termination', 'confidentiality', 'data.security', 'insurance', 'compliance',
  'law.governing', 'law.forum',
  // The "Miscellaneous" section is where amendments most often bite, so it gets its own keys
  // instead of being dumped into misc.
  'notices', 'amendment', 'assignment', 'publicity', 'severability', 'entire_agreement', 'costs',
  'information_review', 'other_engagements',
  'misc', 'effectiveness', 'signatures'];

// Long contracts blow past the model output limit, because it returns the full text of
// every clause. Split the document into parts on section boundaries and parse part by part.
function v2Chunks_(text, maxLen) {
  var t = String(text || '');
  if (t.length <= maxLen) return [t];
  var parts = t.split(/\n(?=\s*\d{1,2}\.\s+[A-Z])/);        // "1. DEFINITIONS", "11. PRICE AND ..."
  if (parts.length < 2) parts = t.split(/\n(?=[A-Z][A-Z \-]{6,}\n)/);
  var out = [], cur = '';
  parts.forEach(function (p) {
    if (cur && (cur.length + p.length) > maxLen) { out.push(cur); cur = p; }
    else { cur = cur ? (cur + '\n' + p) : p; }
  });
  if (cur) out.push(cur);
  // a single section longer than the limit still has to be cut
  var safe = [];
  out.forEach(function (c) {
    while (c.length > maxLen) { safe.push(c.slice(0, maxLen)); c = c.slice(maxLen); }
    if (c) safe.push(c);
  });
  return safe;
}

// A single malformed string should not cost a whole part: repair the usual damage and,
// failing that, salvage the block objects that are intact.
function salvageBlocks_(raw) {
  var t = String(raw || '').replace(/```json|```/g, '').trim();
  try { return (JSON.parse(t).blocks) || []; } catch (e) {}
  // unescaped quotes inside a "text": "..." value
  var fixed = t.replace(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g, function (m, inner) {
    return '"text": "' + inner.replace(/\n/g, ' ') + '"';
  });
  try { return (JSON.parse(fixed).blocks) || []; } catch (e) {}
  var out = [];
  var re = /\{[^{}]*"semanticKey"\s*:\s*"[^"]*"[^{}]*\}/g, m;
  while ((m = re.exec(t))) {
    try { out.push(JSON.parse(m[0])); } catch (e) {}
  }
  return out;
}

function v2BlocksChunk_(key, chunk, partNo, total, profile) {
  var prompt =
    'Split this part of a contract into its clauses. Reply with ONE JSON object: {"blocks":[...]} and nothing else.\n' +
    'Each block: {"path":"3.2","level":2,"title":"Payment","text":"full text of the clause","semanticKey":"payment.term"}\n' +
    '- path: the full address of the item as written, including letter or roman sub-items:\n' +
    '  "3", "3.2", "7.2.1", "9.3(b)", "IV.2", "2.1.a". Every numbered, lettered or bulleted item is its own block.\n' +
    '  For an unnumbered bullet use the parent number plus its position: "9.1", "9.2" under section 9.\n' +
    '- replacesPath: only for an amendment — the clause or section number of the ORIGINAL document that this\n' +
    '  text replaces: "Clause 3.2 of the Agreement is deleted and replaced" -> "3.2";\n' +
    '  "Section 5 of the Agreement is deleted and replaced" -> "5". Use "" when nothing is being replaced.\n' +
    '- replacesIn: which document it targets — "agreement" for "of the Agreement",\n' +
    '  "annex" for "of Statement of Work No. 1" / "of the SOW". Use "" when replacesPath is empty.\n' +
    '- replacementText: only for an amendment — the new wording it inserts, i.e. the text quoted after\n' +
    '  "replaced with the following", without the introductory sentence and without the quotation marks.\n' +
    '- level: 1 for a section heading, 2 for a clause, 3 for a sub-clause\n' +
    '- title: short heading if the clause has one, otherwise ""\n' +
    '- text: the complete wording of that clause, verbatim, no summarising\n' +
    '- semanticKey: exactly one of: ' + SEMANTIC_KEYS.join(', ') + '\n' +
    'Keep the original order. Do not merge clauses. Do not invent clauses. Skip tables of contents.\n' +
    'Inside the text use plain straight quotes only; escape them properly so the JSON stays valid.\n' +
    'The parties appear as PARTY_US and PARTY_OTHER; personal data is masked — keep those tokens as they are.\n' +
    ((PARSE_PROFILES[profile || ''] || '') ? (PARSE_PROFILES[profile] + '\n') : '') +
    (total > 1 ? ('This is part ' + partNo + ' of ' + total + ' — parse only what is here.\n') : '') +
    '\nCONTRACT TEXT:\n' + chunk;

  var call = geminiCall_(key, JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 65536 }
  }));
  if (!call.ok) return { ok: false, error: call.error };
  try {
    var data = JSON.parse(call.body);
    var cand = data.candidates && data.candidates[0];
    if (!cand) return { ok: false, error: 'Empty answer from the model' };
    if (cand.finishReason && cand.finishReason !== 'STOP') {
      return { ok: false, error: 'The answer was cut off (' + cand.finishReason + ') — the part is still too long' };
    }
    var out = cand.content.parts[0].text;
    var blocks = salvageBlocks_(out);
    if (!blocks.length) return { ok: false, error: 'Could not read the structure of this part' };
    return { ok: true, blocks: blocks };
  } catch (e) { return { ok: false, error: 'Could not read the structure: ' + e }; }
}

// A part whose answer got cut off is split in half and retried — better a slower parse
// than a document that silently loses two thirds of its clauses.
function v2BlocksPart_(key, chunk, label, depth, profile) {
  var r = v2BlocksChunk_(key, chunk, label, 0, profile);
  if (r.ok) return { ok: true, blocks: r.blocks, notes: [label + ': ' + r.blocks.length + ' clauses'] };
  if (depth >= 2 || chunk.length < 3000) return { ok: false, blocks: [], notes: [label + ': ' + r.error] };
  var half = Math.floor(chunk.length / 2);
  var cut = chunk.lastIndexOf('\n', half);
  if (cut < 1000) cut = half;
  var a = v2BlocksPart_(key, chunk.slice(0, cut), label + 'a', depth + 1, profile);
  var b = v2BlocksPart_(key, chunk.slice(cut), label + 'b', depth + 1, profile);
  return { ok: (a.ok || b.ok), blocks: a.blocks.concat(b.blocks), notes: a.notes.concat(b.notes) };
}

// The document says what it is: "Amendment No. 1 to ... Agreement No. 2402-1",
// "executed as of 28 February 2025". Read it instead of asking the user to retype it.
function v2DocMeta_(key, head) {
  var prompt =
    'Read the opening of a contract document and reply with ONE JSON object, nothing else:\n' +
    '{"kind":"agreement|annex|amendment","number":"","date":"YYYY-MM-DD","parentNumber":"","title":""}\n' +
    '- kind: "amendment" for an amendment / addendum / supplementary agreement;\n' +
    '  "annex" for a statement of work, attachment, appendix, schedule; otherwise "agreement"\n' +
    '- number: the document number as written ("2402-1", "Amendment No. 1")\n' +
    '- date: the date it was signed or executed ("as of 28 February 2025" -> 2025-02-28); "" if absent\n' +
    '- parentNumber: for an amendment or annex — the number of the agreement it belongs to; "" otherwise\n' +
    '- title: the heading of the document\n\n' +
    'TEXT:\n' + String(head).slice(0, 6000);
  var call = geminiCall_(key, JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  }));
  if (!call.ok) return null;
  try {
    var data = JSON.parse(call.body);
    var out = data.candidates[0].content.parts[0].text;
    var o = JSON.parse(String(out).replace(/```json|```/g, '').trim());
    var k = trim_(o.kind).toLowerCase();
    return {
      kind: (k === 'amendment' || k === 'annex') ? k : 'agreement',
      number: trim_(o.number), date: /^\d{4}-\d{2}-\d{2}$/.test(trim_(o.date)) ? trim_(o.date) : '',
      parentNumber: trim_(o.parentNumber), title: trim_(o.title)
    };
  } catch (e) { return null; }
}

// The shape of a document can be read off the text itself — no need to ask the user.
function detectProfile_(text) {
  var t = String(text || ''), sample = t.slice(0, 20000);
  var lines = sample.split('\n').filter(function (l) { return l.trim().length > 20; });
  var latin = (sample.match(/[A-Za-z]/g) || []).length;
  var other = (sample.match(/[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF]/g) || []).length;
  if (other > latin * 0.25) return 'bilingual';

  if (/\bArticle\s+[IVXLC]+\b/i.test(sample) || /\bSection\s+\d+(\.\d+)*\b/.test(sample)) {
    if (!/^\s*\d+\.\d+\.?\s/m.test(sample)) return 'articles';
  }
  var numbered = lines.filter(function (l) { return /^\s*(\d+(\.\d+)*[.)]|\([a-z0-9]+\)|[a-z][.)])\s/i.test(l); }).length;
  if (lines.length > 20 && numbered / lines.length < 0.12) return 'unnumbered';

  // OCR damage that survives the repair pass points at a scan
  var broken = (sample.match(/[A-Za-z][<\]\}|\\][a-z]/g) || []).length;
  if (broken > sample.length / 900) return 'scanned';

  var tabbish = lines.filter(function (l) { return /\t|\s{4,}\S+\s{4,}/.test(l); }).length;
  if (lines.length > 15 && tabbish / lines.length > 0.35) return 'table';
  return '';
}

function v2Blocks_(text, profile) {
  var key = geminiKey_();
  if (!key) return { ok: false, error: 'AI key is not configured — Contracts 2.0 needs it to split the text into clauses' };
  var chunks = v2Chunks_(text, 9000);
  var all = [], notes = [], failed = 0;
  for (var i = 0; i < chunks.length; i++) {
    var r = v2BlocksPart_(key, chunks[i], 'part ' + (i + 1), 0, profile);
    all = all.concat(r.blocks);
    notes = notes.concat(r.notes);
    if (!r.ok) failed++;
  }
  if (!all.length) return { ok: false, error: notes.join('; ') || 'The model returned no clauses' };
  return { ok: true, blocks: all, chunks: chunks.length, failedChunks: failed, notes: notes };
}

// Test mode: parse any file without linking it to a contract. Everything lands under the
// pseudo-contract "__sandbox", so the real contracts stay clean.
function v2ParseUpload_(d) {
  requireAdmin_(d);
  var fileName = trim_(d.fileName) || 'test document';
  if (!d.dataBase64) return { ok: false, error: 'No file data' };
  var file;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(d.dataBase64), trim_(d.mimeType) || 'application/pdf', fileName);
    file = attachmentsFolder_().createFile(blob);
  } catch (e) { return { ok: false, error: 'Upload failed: ' + e }; }
  return v2ParseFile_('__sandbox', file.getId(), fileName, '', 'agreement', trim_(d.counterpartyName), trim_(d.profile));
}

// Shared by both entry points: OCR -> mask -> split into clauses -> store.
function v2ParseFile_(contractId, driveFileId, fileName, attachmentId, kind, cpName, profile) {
  var t0 = Date.now();
  var r = ocrText_(driveFileId);
  if (!r.ok) return { ok: false, error: r.error };
  var text = dedupePages_(fixOcrText_(String(r.text || '')));
  var tOcr = Date.now() - t0;
  if (text.replace(/\s/g, '').length < 40) return { ok: false, error: 'No readable text in this file' };

  var t1 = Date.now();
  var masked = maskForAI_(text, cpName || '');
  var meta = v2DocMeta_(geminiKey_(), masked);       // what this document is, from the document itself
  var autoProfile = trim_(profile);
  if (!autoProfile) autoProfile = detectProfile_(text);   // ask the document, not the user
  var res = v2Blocks_(masked, autoProfile);
  var tAi = Date.now() - t1;
  if (!res.ok) return res;
  var t2 = Date.now();

  readAll_(SHEETS.documents).forEach(function (doc) {
    var same = attachmentId ? (String(doc.AttachmentID) === attachmentId) : (String(doc.FileName) === fileName);
    if (String(doc.ContractID) === contractId && same) {
      deleteRowsWhere_(SHEETS.blocks, 'DocumentID', doc.DocumentID);
      deleteRowsWhere_(SHEETS.documents, 'DocumentID', doc.DocumentID);
    }
  });

  var docId = Utilities.getUuid(), now = new Date().toISOString();
  var kindFinal = (meta && meta.kind) ? meta.kind : (kind || 'agreement');
  var dateFinal = (meta && meta.date) ? meta.date : '';
  appendRow_(SHEETS.documents, {
    DocumentID: docId, ContractID: contractId, Kind: kindFinal,
    Number: (meta && meta.number) ? meta.number : fileName,
    SignDate: dateFinal, EffectiveFrom: dateFinal, Status: 'signed', Source: 'external',
    AttachmentID: attachmentId || '', FileName: fileName, CreatedAt: now
  });

  var list = dedupeBlocks_(res.blocks);
  var head = HEADERS.blocks;
  var rows = list.map(function (b, i) {
    var k = trim_(b.semanticKey);
    var rec = {
      BlockID: Utilities.getUuid(), DocumentID: docId, ContractID: contractId,
      SemanticKey: (SEMANTIC_KEYS.indexOf(k) >= 0 ? k : 'misc'),
      Path: trim_(b.path), ReplacesPath: trim_(b.replacesPath),
      ReplacesIn: (trim_(b.replacesIn) === 'annex' ? 'annex' : (trim_(b.replacesPath) ? 'agreement' : '')),
      ReplacementText: unmaskAI_(String(b.replacementText || ''), cpName || ''),
      Level: num_(b.level) || 2, Title: trim_(b.title),
      Text: unmaskAI_(String(b.text || ''), cpName || ''), Params: '', Origin: 'external',
      SortOrder: i + 1, CreatedAt: now
    };
    return head.map(function (h) { return rec[h] != null ? rec[h] : ''; });
  });
  if (rows.length) {
    var sh = getSheet_(SHEETS.blocks);
    var start = sh.getLastRow() + 1;
    sh.getRange(start, head.indexOf('Path') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, head.indexOf('ReplacesPath') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, head.indexOf('ReplacesIn') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, head.indexOf('SemanticKey') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, head.length).setValues(rows);
  }
  // Snapshot of the previous parse of the same file, so a prompt change shows its effect.
  var prevSnap = '';
  readAll_(SHEETS.documents).forEach(function (x) {
    if (String(x.ContractID) === contractId && String(x.FileName) === fileName && x.DocumentID !== docId && x.Snapshot) prevSnap = x.Snapshot;
  });
  var counts = {};
  list.forEach(function (bl) { var k = trim_(bl.semanticKey) || 'misc'; counts[k] = (counts[k] || 0) + 1; });
  var snap = JSON.stringify({ total: rows.length, keys: counts });
  updateRow_(SHEETS.documents, 'DocumentID', docId, { Snapshot: snap, Profile: autoProfile || '' });

  var diff = null;
  if (prevSnap) {
    try {
      var p = JSON.parse(prevSnap), changes = [];
      if (p.total !== rows.length) changes.push('clauses ' + p.total + ' → ' + rows.length);
      var allKeys = {};
      for (var k1 in (p.keys || {})) allKeys[k1] = 1;
      for (var k2 in counts) allKeys[k2] = 1;
      for (var k in allKeys) {
        var a = (p.keys || {})[k] || 0, b2 = counts[k] || 0;
        if (a !== b2) changes.push(k + ' ' + a + ' → ' + b2);
      }
      diff = changes.length ? changes : ['identical to the previous parse'];
    } catch (e) {}
  }

  return { ok: true, documentId: docId, blocks: rows.length, meta: meta || null, diff: diff, profile: autoProfile,
           timing: { ocrMs: tOcr, aiMs: tAi, saveMs: Date.now() - t2, chars: text.length, model: geminiModel_(),
                     parts: res.chunks || 1, failedParts: res.failedChunks || 0 },
           notes: res.notes || [] };
}

function v2Parse_(d) {
  requireAdmin_(d);
  var contractId = trim_(d.contractId);
  var attId = trim_(d.attachmentId);
  if (!contractId || !attId) return { ok: false, error: 'Pick a contract and one of its documents' };
  var a = findRow_(SHEETS.attachments, 'AttachmentID', attId);
  if (!a || !a.DriveFileID) return { ok: false, error: 'Document not found' };
  var c = findRow_(SHEETS.contracts, 'ContractID', contractId);
  var kind = (trim_(a.DocType) === 'amendment') ? 'amendment' : (trim_(a.DocType) === 'annex' ? 'annex' : 'agreement');
  var res = v2ParseFile_(contractId, a.DriveFileID, trim_(a.FileName), attId, kind, c ? cpName_(c.CounterpartyID) : '', trim_(d.profile));
  if (res.ok) {
    // keep the dates and status of the source attachment on the document row
    var upd = { Status: (trim_(a.DocType) === 'draft') ? 'draft' : 'signed' };
    if (!res.meta || !res.meta.date) { upd.SignDate = trim_(a.DocDate); upd.EffectiveFrom = trim_(a.DocDate); }
    if (!res.meta || !res.meta.number) upd.Number = trim_(a.Description) || trim_(a.FileName);
    updateRow_(SHEETS.documents, 'DocumentID', res.documentId, upd);
  }
  return res;
}

// Reviewing the mapping is the point of step one, so it must be correctable on the spot.
function v2SetKey_(d) {
  requireAdmin_(d);
  var k = trim_(d.semanticKey);
  if (SEMANTIC_KEYS.indexOf(k) < 0) return { ok: false, error: 'Unknown key' };
  var b = findRow_(SHEETS.blocks, 'BlockID', trim_(d.blockId));
  if (!b) return { ok: false, error: 'Clause not found' };
  updateRow_(SHEETS.blocks, 'BlockID', b.BlockID, { SemanticKey: k });
  return { ok: true };
}

// The address an amendment points at can be corrected by hand — the wording is not always explicit.
function v2SetReplaces_(d) {
  requireAdmin_(d);
  var b = findRow_(SHEETS.blocks, 'BlockID', trim_(d.blockId));
  if (!b) return { ok: false, error: 'Clause not found' };
  var upd2 = { ReplacesPath: trim_(d.replacesPath) };
  if (d.replacesIn !== undefined) upd2.ReplacesIn = (trim_(d.replacesIn) === 'annex' ? 'annex' : 'agreement');
  updateRow_(SHEETS.blocks, 'BlockID', b.BlockID, upd2);
  return { ok: true };
}

// The kind of a document decides how it merges, so it must be correctable —
// especially for files parsed in test mode, where there is no attachment to take it from.
function v2SetDoc_(d) {
  requireAdmin_(d);
  var doc = findRow_(SHEETS.documents, 'DocumentID', trim_(d.documentId));
  if (!doc) return { ok: false, error: 'Document not found' };
  var upd = {};
  if (d.kind !== undefined) {
    var k = trim_(d.kind);
    upd.Kind = (k === 'annex' || k === 'amendment') ? k : 'agreement';
  }
  if (d.signDate !== undefined) { upd.SignDate = trim_(d.signDate); upd.EffectiveFrom = trim_(d.signDate); }
  if (d.status !== undefined) upd.Status = (trim_(d.status) === 'draft') ? 'draft' : 'signed';
  if (d.profile !== undefined) upd.Profile = trim_(d.profile);
  if (d.notes !== undefined) upd.Notes = trim_(d.notes);
  updateRow_(SHEETS.documents, 'DocumentID', doc.DocumentID, upd);
  return { ok: true };
}

// ── Editing clauses ────────────────────────────────────────────────────────────
// A clause taken from a signed PDF is a reconstruction: once edited it is marked as such,
// so nobody mistakes it for the literal wording of the signed document.
function v2SaveBlock_(d) {
  requireAdmin_(d);
  var b = findRow_(SHEETS.blocks, 'BlockID', trim_(d.blockId));
  if (!b) return { ok: false, error: 'Clause not found' };
  var upd = {};
  if (d.text !== undefined) upd.Text = trim_(d.text);
  if (d.title !== undefined) upd.Title = trim_(d.title);
  if (d.path !== undefined) upd.Path = trim_(d.path);
  if (d.level !== undefined) upd.Level = num_(d.level) || 2;
  if (d.semanticKey !== undefined && SEMANTIC_KEYS.indexOf(trim_(d.semanticKey)) >= 0) upd.SemanticKey = trim_(d.semanticKey);
  if (d.sortOrder !== undefined) upd.SortOrder = num_(d.sortOrder);
  if (trim_(b.Origin) === 'external' && d.text !== undefined && trim_(d.text) !== trim_(b.Text)) upd.Origin = 'external-edited';
  updateRow_(SHEETS.blocks, 'BlockID', b.BlockID, upd);
  return { ok: true };
}

function v2AddBlock_(d) {
  requireAdmin_(d);
  var docId = trim_(d.documentId);
  var doc = findRow_(SHEETS.documents, 'DocumentID', docId);
  if (!doc) return { ok: false, error: 'Pick the document this clause belongs to' };
  var after = num_(d.afterSort) || 0;
  var row = {
    BlockID: Utilities.getUuid(), DocumentID: docId, ContractID: doc.ContractID,
    SemanticKey: (SEMANTIC_KEYS.indexOf(trim_(d.semanticKey)) >= 0 ? trim_(d.semanticKey) : 'misc'),
    Path: trim_(d.path), ReplacesPath: '', ReplacesIn: '', ReplacementText: '',
    Level: num_(d.level) || 2, Title: trim_(d.title), Text: trim_(d.text), Params: '',
    Origin: 'manual', SortOrder: after + 0.5, CreatedAt: new Date().toISOString()
  };
  appendRow_(SHEETS.blocks, row);
  return { ok: true, block: row };
}

function v2DeleteBlock_(d) {
  requireAdmin_(d);
  deleteRowsWhere_(SHEETS.blocks, 'BlockID', trim_(d.blockId));
  return { ok: true };
}

// ── Values behind the clauses ──────────────────────────────────────────────────
// The clauses in force are the source of truth; the contract record is derived from them.
// Because this runs on the effective version, an amendment that changed the rate or the
// payment term is already taken into account. Every value carries the clause it came from.
var V2_PARAM_FIELDS = [
  ['amount', 'the contract price or the hourly rate, digits only'],
  ['currency', 'USD, EUR, AED or SGD'],
  ['pricingType', '"hourly" if paid per hour, otherwise "lump"'],
  ['rateBasis', 'e.g. "per hour"'],
  ['signDate', 'ISO date the agreement was signed'],
  ['startDate', 'ISO date the work or the term starts'],
  ['endDate', 'ISO date the term ends'],
  ['paymentDays', 'days to pay, integer'],
  ['acceptanceDays', 'days for acceptance or evaluation, integer'],
  ['remarksDays', 'days to give remarks, integer'],
  ['noticeDays', 'days of notice for termination, integer'],
  ['disputeDays', 'days to dispute an amount, integer'],
  ['cureDays', 'days to remedy a breach, integer'],
  ['termYears', 'term in years, integer'],
  ['warrantyPeriod', 'as written'],
  ['penaltyDelayPercent', 'number'],
  ['penaltyFailurePercent', 'number'],
  ['penaltyCapPercent', 'number'],
  ['insuranceAmount', 'number'],
  ['liabilityCap', 'the cap on total liability, as written'],
  ['restrictedTerritories', 'as written'],
  ['paymentBasis', '"hourly" | "fixed" | "milestone"'],
  ['reportFrequency', '"on_completion" | "monthly"'],
  ['governingLaw', 'short'],
  ['jurisdictionPlace', 'short'],
  ['arbitrationBody', 'short'],
  ['arbitrationSeat', 'short'],
  ['subject', 'one line describing the subject']
];

function v2ExtractParams_(d) {
  requireAdmin_(d);
  var key = geminiKey_();
  if (!key) return { ok: false, error: 'AI key is not configured' };
  var ids = d.blockIds;
  if (typeof ids === 'string') ids = ids.split(',');
  if (!ids || !ids.length) return { ok: false, error: 'Nothing to read' };

  var all = {};
  readAll_(SHEETS.blocks).forEach(function (b) { all[b.BlockID] = b; });
  var parts = [], cpName = '';
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.contractId));
  if (c) cpName = cpName_(c.CounterpartyID);
  ids.forEach(function (id) {
    var b = all[trim_(id)];
    if (!b) return;
    var txt = trim_(b.ReplacementText) || trim_(b.Text);
    if (!txt) return;
    parts.push('[' + (trim_(b.Path) || '-') + ' | ' + trim_(b.SemanticKey) + '] ' + txt);
  });
  if (!parts.length) return { ok: false, error: 'The clauses have no text' };
  var text = maskForAI_(parts.join('\n\n'), cpName);

  var fieldList = V2_PARAM_FIELDS.map(function (f) { return '- ' + f[0] + ': ' + f[1]; }).join('\n');
  var prompt =
    'Below are the clauses of a contract that are currently in force. Each clause is prefixed with\n' +
    '[clause number | topic]. Extract the values listed and reply with ONE JSON object, nothing else.\n' +
    'For every value give both the value and the clause number it came from. The "from" must be the\n' +
    'number in the [brackets] of the clause whose text actually states that value — never a neighbouring\n' +
    'clause, never a heading, never "signatures". If no clause states it, omit the field entirely.\n' +
    '{"amount":{"value":250,"from":"2.1"}, "paymentDays":{"value":45,"from":"3.4"}}\n' +
    'Omit a field entirely when the clauses do not state it. Never guess.\n' +
    'Numbers written in words with digits in brackets — "within forty-five (45) days" — return 45.\n\n' +
    'FIELDS:\n' + fieldList + '\n\nCLAUSES:\n' + text.slice(0, 60000);

  var call = geminiCall_(key, JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 8192 }
  }));
  if (!call.ok) return { ok: false, error: call.error };
  try {
    var data = JSON.parse(call.body);
    var out = data.candidates[0].content.parts[0].text;
    var obj = JSON.parse(String(out).replace(/```json|```/g, '').trim());
    var res = {};
    V2_PARAM_FIELDS.forEach(function (f) {
      var v = obj[f[0]];
      if (v === undefined || v === null) return;
      if (typeof v === 'object') {
        if (v.value === undefined || v.value === null || v.value === '') return;
        res[f[0]] = { value: unmaskAI_(String(v.value), cpName), from: trim_(v.from) };
      } else if (v !== '') {
        res[f[0]] = { value: unmaskAI_(String(v), cpName), from: '' };
      }
    });
    return { ok: true, fields: res };
  } catch (e) { return { ok: false, error: 'Could not read the values: ' + e }; }
}

// ── Templates as clause libraries ──────────────────────────────────────────────
// A template is just a parsed document kept under a reserved contract id. Any agreement
// you have already parsed can become one, so the library grows out of real documents
// instead of being described separately.
var TPL_CONTRACT = '__templates';

function v2Templates_() {
  return readAll_(SHEETS.documents).filter(function (x) { return String(x.ContractID) === TPL_CONTRACT; });
}

function v2SaveTemplate_(d) {
  requireAdmin_(d);
  var srcId = trim_(d.documentId), name = trim_(d.name);
  var src = findRow_(SHEETS.documents, 'DocumentID', srcId);
  if (!src) return { ok: false, error: 'Document not found' };
  if (!name) name = trim_(src.Number) || trim_(src.FileName) || 'Template';

  // replace a template of the same name
  v2Templates_().forEach(function (t) {
    if (trim_(t.Number) === name) {
      deleteRowsWhere_(SHEETS.blocks, 'DocumentID', t.DocumentID);
      deleteRowsWhere_(SHEETS.documents, 'DocumentID', t.DocumentID);
    }
  });

  var tplId = Utilities.getUuid(), now = new Date().toISOString();
  appendRow_(SHEETS.documents, {
    DocumentID: tplId, ContractID: TPL_CONTRACT, Kind: trim_(src.Kind) || 'agreement', Number: name,
    SignDate: '', EffectiveFrom: '', Status: 'draft', Source: 'template',
    AttachmentID: '', FileName: trim_(src.FileName), Profile: trim_(src.Profile),
    Notes: trim_(d.notes) || trim_(src.Notes), Snapshot: '', CreatedAt: now
  });

  var head = HEADERS.blocks;
  var rows = readAll_(SHEETS.blocks)
    .filter(function (b) { return String(b.DocumentID) === srcId; })
    .sort(function (a, b) { return (num_(a.SortOrder) || 0) - (num_(b.SortOrder) || 0); })
    .map(function (b, i) {
      var rec = {
        BlockID: Utilities.getUuid(), DocumentID: tplId, ContractID: TPL_CONTRACT,
        SemanticKey: b.SemanticKey, Path: b.Path, ReplacesPath: '', ReplacesIn: '', ReplacementText: '',
        Level: b.Level, Title: b.Title, Text: trim_(b.ReplacementText) || trim_(b.Text),
        Params: '', Origin: 'template', SortOrder: i + 1, CreatedAt: now
      };
      return head.map(function (h) { return rec[h] != null ? rec[h] : ''; });
    });
  if (rows.length) {
    var sh = getSheet_(SHEETS.blocks), start = sh.getLastRow() + 1;
    sh.getRange(start, head.indexOf('Path') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, head.indexOf('SemanticKey') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, head.length).setValues(rows);
  }
  return { ok: true, templateId: tplId, name: name, blocks: rows.length };
}

function v2FromTemplate_(d) {
  requireAdmin_(d);
  var contractId = trim_(d.contractId), tplId = trim_(d.templateId);
  if (!contractId || contractId === TPL_CONTRACT) return { ok: false, error: 'Pick the contract to fill' };
  var tpl = findRow_(SHEETS.documents, 'DocumentID', tplId);
  if (!tpl) return { ok: false, error: 'Template not found' };
  var c = findRow_(SHEETS.contracts, 'ContractID', contractId);

  var docId = Utilities.getUuid(), now = new Date().toISOString();
  appendRow_(SHEETS.documents, {
    DocumentID: docId, ContractID: contractId, Kind: trim_(d.kind) || trim_(tpl.Kind) || 'agreement',
    Number: (c ? trim_(c.Number) : '') || trim_(tpl.Number),
    SignDate: c ? trim_(c.SignDate) : '', EffectiveFrom: c ? trim_(c.SignDate) : '',
    Status: 'draft', Source: 'template', AttachmentID: '',
    FileName: 'from template: ' + trim_(tpl.Number), Notes: '', CreatedAt: now
  });

  var head = HEADERS.blocks;
  var rows = readAll_(SHEETS.blocks)
    .filter(function (b) { return String(b.DocumentID) === tplId; })
    .sort(function (a, b) { return (num_(a.SortOrder) || 0) - (num_(b.SortOrder) || 0); })
    .map(function (b, i) {
      var rec = {
        BlockID: Utilities.getUuid(), DocumentID: docId, ContractID: contractId,
        SemanticKey: b.SemanticKey, Path: b.Path, ReplacesPath: '', ReplacesIn: '', ReplacementText: '',
        Level: b.Level, Title: b.Title, Text: b.Text, Params: '', Origin: 'template',
        SortOrder: i + 1, CreatedAt: now
      };
      return head.map(function (h) { return rec[h] != null ? rec[h] : ''; });
    });
  if (rows.length) {
    var sh = getSheet_(SHEETS.blocks), start = sh.getLastRow() + 1;
    sh.getRange(start, head.indexOf('Path') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, head.indexOf('SemanticKey') + 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, head.length).setValues(rows);
  }
  return { ok: true, documentId: docId, blocks: rows.length };
}

// ── History of terms ───────────────────────────────────────────────────────────
// The contract record holds the terms in force now — that is what new work is priced by.
// This log keeps every value with the date it took effect, so "what was the rate in March"
// has an answer even after an amendment changed it. Reports already freeze their own rate
// when they are created, so past work is never repriced.
function v2TermsOf_(contractId) {
  return readAll_(SHEETS.terms).filter(function (t) { return String(t.ContractID) === String(contractId); });
}

function v2LogTerms_(d) {
  requireAdmin_(d);
  var contractId = trim_(d.contractId);
  if (!contractId || contractId === '__sandbox') return { ok: false, error: 'Pick a real contract' };
  var items = d.items;
  if (typeof items === 'string') items = JSON.parse(items);
  if (!items || !items.length) return { ok: false, error: 'Nothing to record' };
  var existing = v2TermsOf_(contractId), now = new Date().toISOString(), added = 0;
  items.forEach(function (it) {
    var field = trim_(it.field), value = trim_(it.value), from = trim_(it.validFrom);
    if (!field) return;
    // A later document that merely restates an unchanged term is not a new fact:
    // record a value only when it differs from the one already in force on that date.
    var prior = null, priorFrom = '';
    existing.forEach(function (t) {
      if (trim_(t.Field) !== field) return;
      var tf = String(t.ValidFrom).slice(0, 10);
      if (from && tf && tf > from) return;
      if (!prior || tf >= priorFrom) { prior = t; priorFrom = tf; }
    });
    if (prior && trim_(prior.Value) === value) return;
    var dup = existing.some(function (t) {
      return trim_(t.Field) === field && trim_(t.Value) === value && String(t.ValidFrom).slice(0, 10) === from;
    });
    if (dup) return;
    appendRow_(SHEETS.terms, {
      TermID: Utilities.getUuid(), ContractID: contractId, Field: field, Value: value,
      ValidFrom: from, FromClause: trim_(it.fromClause), DocumentID: trim_(it.documentId),
      Note: trim_(it.note), CreatedAt: now
    });
    existing.push({ Field: field, Value: value, ValidFrom: from });
    added++;
  });
  return { ok: true, added: added };
}

// Build the whole history at once, document by document: the agreement gives the original
// terms dated by its own signature, each amendment gives the values it changed dated by its
// own effective date. Nothing depends on what the admin happened to tick.
function v2BuildHistory_(d) {
  requireAdmin_(d);
  var contractId = trim_(d.contractId);
  if (!contractId || contractId === '__sandbox') return { ok: false, error: 'Pick a real contract' };

  var docs = readAll_(SHEETS.documents).filter(function (x) { return String(x.ContractID) === contractId; });
  if (!docs.length) return { ok: false, error: 'No parsed documents for this contract' };
  docs.sort(function (a, b) {
    return String(a.EffectiveFrom || a.SignDate || '').localeCompare(String(b.EffectiveFrom || b.SignDate || ''));
  });

  var blocks = readAll_(SHEETS.blocks).filter(function (x) { return String(x.ContractID) === contractId; });
  var notes = [], total = 0;

  for (var i = 0; i < docs.length; i++) {
    var doc = docs[i];
    var mine = blocks.filter(function (b) { return String(b.DocumentID) === String(doc.DocumentID); });
    if (!mine.length) { notes.push((doc.FileName || doc.Number) + ': no clauses'); continue; }
    var res = v2ExtractParams_({ passcode: d.passcode, contractId: contractId,
                                 blockIds: mine.map(function (b) { return b.BlockID; }) });
    if (!res.ok) { notes.push((doc.FileName || doc.Number) + ': ' + res.error); continue; }

    var when = String(doc.EffectiveFrom || doc.SignDate || '').slice(0, 10);
    var items = [];
    for (var f in res.fields) {
      items.push({ field: f, value: String(res.fields[f].value), validFrom: when,
                   fromClause: res.fields[f].from || '', documentId: doc.DocumentID,
                   note: (doc.Kind === 'amendment') ? ('changed by ' + (doc.Number || 'amendment'))
                       : (doc.Kind === 'annex' ? ('from ' + (doc.Number || 'annex')) : 'original') });
    }
    if (items.length) {
      var lr = v2LogTerms_({ passcode: d.passcode, contractId: contractId, items: items });
      total += (lr.added || 0);
      notes.push((doc.FileName || doc.Number) + ': ' + items.length + ' values, ' + (lr.added || 0) + ' new');
    } else {
      notes.push((doc.FileName || doc.Number) + ': nothing to record');
    }
  }
  return { ok: true, added: total, notes: notes };
}

// The value of a term on a given date — for future use by reports and invoices.
function termAt_(contractId, field, dateStr) {
  var best = null, bestFrom = '';
  v2TermsOf_(contractId).forEach(function (t) {
    if (trim_(t.Field) !== field) return;
    var from = String(t.ValidFrom || '').slice(0, 10);
    if (dateStr && from && from > dateStr) return;
    if (!best || from >= bestFrom) { best = t; bestFrom = from; }
  });
  return best ? best.Value : '';
}

// ── Assembling a document out of the clauses in force ──────────────────────────
function contractsFolder_() {
  var name = 'FXWorks Contracts';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function v2Generate_(d) {
  requireAdmin_(d);
  var ids = d.blockIds;
  if (typeof ids === 'string') ids = ids.split(',');
  if (!ids || !ids.length) return { ok: false, error: 'Nothing to assemble' };
  var all = {}, order = [];
  readAll_(SHEETS.blocks).forEach(function (b) { all[b.BlockID] = b; });
  ids.forEach(function (id) { if (all[trim_(id)]) order.push(all[trim_(id)]); });
  if (!order.length) return { ok: false, error: 'The clauses were not found' };

  var title = trim_(d.title) || 'Contract';
  var doc = DocumentApp.create(title);
  var body = doc.getBody();
  body.clear();
  var head = body.appendParagraph(title);
  head.setHeading(DocumentApp.ParagraphHeading.TITLE);
  if (trim_(d.subtitle)) body.appendParagraph(trim_(d.subtitle)).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  order.forEach(function (b) {
    var lvl = num_(b.Level) || 2;
    var num = trim_(b.Path) ? (trim_(b.Path) + '. ') : '';
    var ttl = trim_(b.Title);
    var text = trim_(b.ReplacementText) || trim_(b.Text);
    if (lvl <= 1) {
      body.appendParagraph(num + (ttl || '')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      if (text && text !== ttl) body.appendParagraph(text);
    } else {
      var p = body.appendParagraph(num + (ttl ? ttl + '. ' : '') + text);
      p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    }
  });

  var file = DriveApp.getFileById(doc.getId());
  doc.saveAndClose();
  var folder = contractsFolder_();
  folder.addFile(file);
  try { DriveApp.getRootFolder().removeFile(file); } catch (e) {}

  var pdf = folder.createFile(file.getAs('application/pdf').setName(title + '.pdf'));
  var docx = null;
  try {
    var url = 'https://www.googleapis.com/drive/v3/files/' + doc.getId() + '/export?mimeType=' +
              encodeURIComponent('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) docx = folder.createFile(resp.getBlob().setName(title + '.docx'));
  } catch (e) {}

  // attach the result to the contract, as a draft — it is generated, not signed
  var contractId = trim_(d.contractId);
  if (contractId && contractId !== '__sandbox') {
    appendRow_(SHEETS.attachments, {
      AttachmentID: Utilities.getUuid(), ParentType: 'contract', ParentID: contractId,
      FileName: title + '.pdf', Description: 'assembled from the effective version',
      DocType: 'draft', DocDate: new Date().toISOString().slice(0, 10), IsCurrent: 'no',
      DriveFileID: pdf.getId(), Url: pdf.getUrl(), CreatedAt: new Date().toISOString()
    });
  }
  return { ok: true, clauses: order.length, docUrl: doc.getUrl(), pdfUrl: pdf.getUrl(),
           docxUrl: docx ? docx.getUrl() : '' };
}

// Blocks whose document row is gone would otherwise keep showing up and be counted.
function v2PurgeOrphans_(contractId) {
  var docIds = {};
  readAll_(SHEETS.documents).forEach(function (x) { docIds[x.DocumentID] = 1; });
  var sh = getSheet_(SHEETS.blocks), values = sh.getDataRange().getValues();
  var head = values[0], cDoc = head.indexOf('DocumentID'), cContract = head.indexOf('ContractID');
  var removed = 0;
  for (var i = values.length - 1; i >= 1; i--) {
    var did = values[i][cDoc];
    if ((!contractId || String(values[i][cContract]) === String(contractId)) && !docIds[did]) { sh.deleteRow(i + 1); removed++; }
  }
  return removed;
}

function v2List_(d) {
  var contractId = trim_(d.contractId);
  v2PurgeOrphans_(contractId);
  if (contractId === TPL_CONTRACT) return { ok: true, documents: v2Templates_(), blocks: readAll_(SHEETS.blocks).filter(function (x) { return String(x.ContractID) === TPL_CONTRACT; }), keys: SEMANTIC_KEYS };
  var docs = readAll_(SHEETS.documents).filter(function (x) { return String(x.ContractID) === contractId; });
  var blocks = readAll_(SHEETS.blocks).filter(function (x) { return String(x.ContractID) === contractId; });
  return { ok: true, documents: docs, blocks: blocks, keys: SEMANTIC_KEYS, profiles: Object.keys(PARSE_PROFILES) };
}

function v2DeleteDoc_(d) {
  requireAdmin_(d);
  var id = trim_(d.documentId);
  deleteRowsWhere_(SHEETS.blocks, 'DocumentID', id);
  deleteRowsWhere_(SHEETS.documents, 'DocumentID', id);
  return { ok: true };
}


// ─────────────────────────────────────────────────────────────────────────────
// Generating a contract from the Google Docs templates.
// The template ids live in Script Properties, so they survive a redeploy and are
// not baked into the code.
// ─────────────────────────────────────────────────────────────────────────────
var TPL_KEYS = ['tpl_b2b_agreement', 'tpl_b2b_sow', 'tpl_ica', 'tpl_ica_sow', 'tpl_uplift'];

function appSettings_() {
  var p = PropertiesService.getScriptProperties(), out = {};
  TPL_KEYS.forEach(function (k) { out[k] = p.getProperty(k) || ''; });
  return out;
}

function adminSaveSettings_(d) {
  requireAdmin_(d);
  var p = PropertiesService.getScriptProperties();
  TPL_KEYS.forEach(function (k) {
    if (d[k] !== undefined) p.setProperty(k, extractDocId_(trim_(d[k])));
  });
  return { ok: true, settings: appSettings_() };
}

// Accepts either a bare id or a full Google Docs url.
function extractDocId_(v) {
  var m = String(v || '').match(/[-\w]{25,}/);
  return m ? m[0] : trim_(v);
}

function payTermsText_(c) {
  var days = trim_(c.PaymentDays) || '30';
  var adv = trim_(c.AdvancePercent), advDays = trim_(c.AdvanceDays) || '5';
  switch (trim_(c.PaymentOption)) {
    case 'prepay_100':
      return 'The total price shall be paid in advance within ' + advDays + ' calendar days after signature of this Agreement.';
    case 'advance_split':
      return adv + '% of the total price shall be paid as an advance within ' + advDays +
             ' calendar days after signature of this Agreement; the remaining amount shall be paid within ' +
             days + ' calendar days after acceptance of the Deliverables.';
    case 'after_warranty':
      return 'The total price shall be paid within ' + days + ' calendar days after expiry of the warranty period.';
    case 'milestone':
      return 'The price shall be paid by milestones as set out in this Attachment, each milestone payable within ' +
             days + ' calendar days after acceptance of the corresponding Deliverables.';
    default:
      return 'The total price shall be paid within ' + days +
             ' calendar days after signature of the Acceptance Act, or the date on which the Deliverables are deemed accepted.';
  }
}

function reqOf_(id) {
  var r = id ? findRow_(SHEETS.requisites, 'RequisiteID', trim_(id)) : null;
  return r || {};
}

// Our own details when no requisite set is picked on the contract.
function ourDefaultRequisite_() {
  var us = findRow_(SHEETS.counterparties, 'Name', CONFIG.COMPANY_NAME);
  return (us && defaultRequisite_(us.CounterpartyID)) || {};
}

function placeholders_(c, over) {
  over = over || {};
  var cp = findRow_(SHEETS.counterparties, 'CounterpartyID', c.CounterpartyID) || {};
  var ours = reqOf_(c.OurRequisiteID), theirs = reqOf_(c.TheirRequisiteID);
  if (!trim_(ours.LegalName) && !trim_(ours.SignatoryName)) ours = ourDefaultRequisite_();
  var weSupply = (trim_(c.OurRole) !== 'customer');
  var supplier = weSupply ? ours : theirs, customer = weSupply ? theirs : ours;
  var supplierName = weSupply ? (trim_(ours.LegalName) || CONFIG.COMPANY_NAME) : (trim_(theirs.LegalName) || trim_(cp.Name));
  var customerName = weSupply ? (trim_(theirs.LegalName) || trim_(cp.Name)) : (trim_(ours.LegalName) || CONFIG.COMPANY_NAME);

  var v = {
    COMPANY_NAME: CONFIG.COMPANY_NAME,
    CONTRACT_NUMBER: trim_(c.Number),
    SOW_NUMBER: '1',
    ATTACHMENT_NUMBER: '1',
    SIGN_DATE: fmtHuman_(over.signDate || c.SignDate),
    EFFECTIVE_DATE: fmtHuman_(c.StartDate || c.SignDate),
    START_DATE: fmtHuman_(c.StartDate),
    END_DATE: fmtHuman_(c.EndDate),
    COMPLETION_DATE: fmtHuman_(c.CompletionDate),
    AMOUNT: (c.Amount === '' || c.Amount == null) ? '' : money_(c.Amount),
    RATE: (c.Amount === '' || c.Amount == null) ? '' : money_(c.Amount),
    CURRENCY: trim_(c.Currency),
    RATE_BASIS: trim_(c.RateBasis) || 'per hour',
    SUBJECT: trim_(c.Subject),
    SOW_SCOPE: trim_(c.SowScope),
    PAYMENT_DAYS: trim_(c.PaymentDays),
    ADVANCE_PERCENT: trim_(c.AdvancePercent),
    ADVANCE_DAYS: trim_(c.AdvanceDays),
    PAYMENT_TERMS_TEXT: payTermsText_(c),
    REMARKS_DAYS: trim_(c.RemarksDays),
    ACCEPTANCE_DAYS: trim_(c.AcceptanceDays),
    EVALUATION_DAYS: trim_(c.EvaluationDays),
    CURE_DAYS: trim_(c.CureDays),
    DISPUTE_DAYS: trim_(c.DisputeDays),
    NOTICE_DAYS: trim_(c.NoticeDays),
    TERM_YEARS: trim_(c.TermYears),
    WARRANTY_PERIOD: trim_(c.WarrantyPeriod),
    PENALTY_DELAY_PERCENT: trim_(c.PenaltyDelayPercent),
    PENALTY_FAILURE_PERCENT: trim_(c.PenaltyFailurePercent),
    PENALTY_CAP_PERCENT: trim_(c.PenaltyCapPercent),
    INSURANCE_AMOUNT: trim_(c.InsuranceAmount),
    RESTRICTED_TERRITORIES: trim_(c.RestrictedTerritories),
    GOVERNING_LAW: trim_(c.GoverningLaw),
    JURISDICTION_PLACE: trim_(c.JurisdictionPlace),
    ARBITRATION_BODY: trim_(c.ArbitrationBody),
    ARBITRATION_SEAT: trim_(c.ArbitrationSeat),
    PAYMENT_BASIS: trim_(c.PaymentBasis),
    REPORT_FREQUENCY: trim_(c.ReportFrequency),
    SUPPLIER_PM_NAME: trim_(c.PMName),
    INVOICE_TRIGGER_TEXT: 'The Supplier may issue an invoice after the Deliverables have been accepted.',
    CONTRACTOR_NAME: trim_(cp.Name),
    CONTRACTOR_ADDRESS: trim_(cp.Address),
    CONTRACTOR_EMAIL: trim_(cp.Email),
    CONTRACTOR_PHONE: trim_(cp.Phone),
    UPLIFT_NUMBER: trim_(c.UpliftNumber) || '2',   // Attachment 1 is the SOW
    UPLIFT_DATE: fmtHuman_(c.UpliftDate || c.SignDate),
    UPLIFT_FROM: fmtHuman_(c.UpliftFrom || c.StartDate || c.SignDate),
    CONTRACTOR_JURISDICTION: '',
    CONTRACTOR_REG_NUMBER: '',
    CONTRACTOR_BENEFICIARY_NAME: '',
    CONTRACTOR_ACCOUNT: '',
    CONTRACTOR_BANK_NAME: '',
    CONTRACTOR_BANK_ADDRESS: '',
    CONTRACTOR_SWIFT: '',
    CONTRACTOR_CORR_BANK: '',
    CONTRACTOR_CORR_SWIFT: ''
  };

  // The ICA SOW prints the contractor's bank details. Take the requisite set chosen on the
  // contract; if none is chosen, fall back to the counterparty's default set.
  var cpReq = theirs;
  if (!trim_(cpReq.AccountNumber) && cp.CounterpartyID) {
    var dflt = defaultRequisite_(cp.CounterpartyID);
    if (dflt) cpReq = dflt;
  }
  v.CONTRACTOR_JURISDICTION = trim_(cpReq.Jurisdiction);
  v.CONTRACTOR_REG_NUMBER = trim_(cpReq.RegNumber);
  v.CONTRACTOR_BENEFICIARY_NAME = trim_(cpReq.BeneficiaryName) || trim_(cp.Name);
  v.CONTRACTOR_ACCOUNT = trim_(cpReq.AccountNumber);
  v.CONTRACTOR_BANK_NAME = trim_(cpReq.BankName);
  v.CONTRACTOR_BANK_ADDRESS = trim_(cpReq.BankAddress);
  v.CONTRACTOR_SWIFT = trim_(cpReq.Swift);
  v.CONTRACTOR_CORR_BANK = trim_(cpReq.CorrBank);
  v.CONTRACTOR_CORR_SWIFT = trim_(cpReq.CorrSwift);

  // Uplift ranges printed into the amendment, with the ceiling worked out from them.
  var ust = upliftSettings_(c);
  v.UPLIFT_BASE = String(ust.base);
  v.UPLIFT_K1_MIN = ust.k1Min.toFixed(2); v.UPLIFT_K1_MAX = ust.k1Max.toFixed(2);
  v.UPLIFT_K2_MIN = ust.k2Min.toFixed(2); v.UPLIFT_K2_MAX = ust.k2Max.toFixed(2);
  v.UPLIFT_K3_MIN = ust.k3Min.toFixed(2); v.UPLIFT_K3_MAX = ust.k3Max.toFixed(2);
  v.UPLIFT_MAX = String(upliftMax_(ust));

  // Who signs for us is asked at generation time — the requisite set holds a default,
  // but the person actually signing can differ from one contract to the next.
  var ourSignatory = trim_(over.signatoryName), ourTitle = trim_(over.signatoryTitle);
  // Fall back to the requisite set, then to the company default — the signature block
  // of our own side must never come out blank.
  if (!ourSignatory) ourSignatory = trim_(ours.SignatoryName) || CONFIG.DEFAULT_SIGNATORY;
  if (!ourTitle) ourTitle = trim_(ours.SignatoryTitle) || CONFIG.DEFAULT_SIGNATORY_TITLE;

  // The ICA template always signs as {{SUPPLIER_SIGNATORY}} for our side, while in an ICA
  // Fraktalex is the customer — so under that template our signatory must fill both roles'
  // aliases. Expose OUR_* as well, which never depends on who is supplier.
  v.OUR_SIGNATORY = ourSignatory;
  v.OUR_SIGNATORY_TITLE = ourTitle;
  v.OUR_NAME = trim_(ours.LegalName) || CONFIG.COMPANY_NAME;
  var icaTemplate = (trim_(c.TemplateType) === 'ica');

  [['SUPPLIER', supplier, supplierName], ['CUSTOMER', customer, customerName]].forEach(function (pair) {
    var pre = pair[0], r = pair[1], nm = pair[2];
    v[pre + '_NAME'] = nm;
    v[pre + '_ADDRESS'] = trim_(r.Address);
    v[pre + '_JURISDICTION'] = trim_(r.Jurisdiction);
    v[pre + '_REG_NUMBER'] = trim_(r.RegNumber);
    var isUs = (pre === 'SUPPLIER') ? weSupply : !weSupply;
    // In an ICA the counterparty is a person who signs in their own name and holds no
    // requisite set, so the supplier-side signatory slot belongs to us.
    var takeOurs = isUs || (icaTemplate && pre === 'SUPPLIER');
    v[pre + '_SIGNATORY'] = takeOurs ? ourSignatory : trim_(r.SignatoryName);
    v[pre + '_SIGNATORY_TITLE'] = takeOurs ? ourTitle : trim_(r.SignatoryTitle);
    v[pre + '_BENEFICIARY_NAME'] = trim_(r.BeneficiaryName);
    v[pre + '_ACCOUNT'] = trim_(r.AccountNumber);
    v[pre + '_BANK_NAME'] = trim_(r.BankName);
    v[pre + '_BANK_ADDRESS'] = trim_(r.BankAddress);
    v[pre + '_SWIFT'] = trim_(r.Swift);
    v[pre + '_CORR_BANK'] = trim_(r.CorrBank);
    v[pre + '_CORR_SWIFT'] = trim_(r.CorrSwift);
  });
  return v;
}

function fmtHuman_(d) {
  var s = String(d || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return trim_(d);
  var M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var p = s.split('-');
  return String(+p[2]) + ' ' + M[+p[1] - 1] + ' ' + p[0];
}
function money_(v) {
  var n = num_(v);
  return n ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

// Conditional blocks: {{#IF_X}} … {{/IF_X}} and {{#IFNOT_X}} … {{/IFNOT_X}}.
// Working paragraph by paragraph is far more predictable than juggling ranges:
// walk the body once, track which block we are inside, and delete what is not wanted.
function applyConditions_(body, flags) {
  var open = /\{\{#(IF|IFNOT)_([A-Z_0-9]+)\}\}/;
  var close = /\{\{\/(IF|IFNOT)_([A-Z_0-9]+)\}\}/;
  for (var guard = 0; guard < 60; guard++) {
    var found = false;
    for (var i = 0; i < body.getNumChildren(); i++) {
      var txt = '';
      try { txt = body.getChild(i).asText().getText(); } catch (e) { continue; }
      var m = txt.match(open);
      if (!m) continue;
      found = true;
      var kind = m[1], name = m[2];
      var keep = (kind === 'IF') ? !!flags[name] : !flags[name];
      // find the matching closing marker
      var endIdx = -1;
      for (var j = i + 1; j < body.getNumChildren(); j++) {
        var t2 = '';
        try { t2 = body.getChild(j).asText().getText(); } catch (e) { continue; }
        var mc = t2.match(close);
        if (mc && mc[1] === kind && mc[2] === name) { endIdx = j; break; }
      }
      if (endIdx < 0) {            // stray marker — just drop that paragraph
        safeRemove_(body, i);
        break;
      }
      if (keep) {
        safeRemove_(body, endIdx);  // keep the content, drop both markers
        safeRemove_(body, i);
      } else {
        for (var k = endIdx; k >= i; k--) safeRemove_(body, k);
      }
      break;
    }
    if (!found) break;
  }
}
function safeRemove_(body, idx) {
  if (idx < 0 || idx >= body.getNumChildren()) return;
  if (body.getNumChildren() <= 1) { try { body.getChild(idx).asText().setText(''); } catch (e) {} return; }
  try { body.removeChild(body.getChild(idx)); } catch (e) {}
}

// What to prefill in the signing dialog: whoever is named in our requisite set.
function adminSigningDefaults_(d) {
  requireAdmin_(d);
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.id));
  if (!c) return { ok: false, error: 'Contract not found' };
  var r = reqOf_(c.OurRequisiteID);
  return { ok: true,
           signatoryName: trim_(r.SignatoryName) || CONFIG.DEFAULT_SIGNATORY,
           signatoryTitle: trim_(r.SignatoryTitle) || CONFIG.DEFAULT_SIGNATORY_TITLE,
           signDate: trim_(c.SignDate) || new Date().toISOString().slice(0, 10) };
}

function adminGenerateContract_(d) {
  requireAdmin_(d);
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.id));
  if (!c) return { ok: false, error: 'Contract not found' };
  if (truthy_(c.ExternalForm) && trim_(d.part) !== 'uplift') return { ok: false, error: 'This contract uses an external form — nothing to generate' };

  var ica = (trim_(c.TemplateType) === 'ica');
  var part = trim_(d.part);
  var which = (part === 'uplift') ? 'tpl_uplift'
            : (part === 'sow') ? (ica ? 'tpl_ica_sow' : 'tpl_b2b_sow')
            : (ica ? 'tpl_ica' : 'tpl_b2b_agreement');
  if (part === 'uplift' && !truthy_(c.OptUplift)) return { ok: false, error: 'Turn on "Performance uplift" in the document settings first' };
  var tplId = PropertiesService.getScriptProperties().getProperty(which);
  if (!tplId) return { ok: false, error: 'Template is not configured yet (' + which + ') — set it in Settings' };

  var name = (part === 'uplift' ? 'Attachment 2 uplift ' : part === 'sow' ? 'SOW ' : 'Agreement ') + trim_(c.Number);
  var folder = contractsFolder_();
  var copy;
  try { copy = DriveApp.getFileById(tplId).makeCopy(name, folder); }
  catch (e) { return { ok: false, error: 'Could not open the template — check the id and access: ' + e }; }

  var doc = DocumentApp.openById(copy.getId());
  var body = doc.getBody();

  var flags = {
    ACCEPTANCE_ACT: truthy_(c.OptAcceptanceAct), PENALTIES: truthy_(c.OptPenalties),
    USAGE_RIGHTS: truthy_(c.OptUsageRights), INSURANCE: truthy_(c.OptInsurance),
    DATA_SECURITY: truthy_(c.OptDataSecurity), WARRANTY: truthy_(c.OptWarranty),
    PAYOUT_CURRENCY: truthy_(c.OptPayoutCurrency)
  };
  applyConditions_(body, flags);

  var v = placeholders_(c, { signatoryName: trim_(d.signatoryName), signatoryTitle: trim_(d.signatoryTitle), signDate: trim_(d.signDate) });
  // Headers and footers are separate containers — replacing only in the body left
  // {{COMPANY_NAME}} showing at the top of every page.
  var targets = [body];
  var hdr = doc.getHeader(), ftr = doc.getFooter();
  if (hdr) targets.push(hdr);
  if (ftr) targets.push(ftr);
  targets.forEach(function (el) {
    Object.keys(v).forEach(function (k) {
      el.replaceText('\\{\\{' + k + '\\}\\}', String(v[k] == null ? '' : v[k]));
    });
    el.replaceText('\\{\\{[A-Z_0-9]+\\}\\}', '');   // nothing unfilled reaches the signed document
  });
  doc.saveAndClose();

  var pdf = folder.createFile(copy.getAs('application/pdf').setName(name + '.pdf'));
  appendRow_(SHEETS.attachments, {
    AttachmentID: Utilities.getUuid(), ParentType: 'contract', ParentID: c.ContractID,
    FileName: name + '.pdf', Description: 'generated from the template',
    DocType: 'draft', DocDate: new Date().toISOString().slice(0, 10), IsCurrent: 'no',
    DriveFileID: pdf.getId(), Url: pdf.getUrl(), CreatedAt: new Date().toISOString()
  });
  return { ok: true, name: name, docUrl: doc.getUrl(), pdfUrl: pdf.getUrl() };
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


// ─────────────────────────────────────────────────────────────────────────────
// AI-assisted extraction (Gemini). The OCR text stays inside Google: the file is
// read in your Drive and the text goes to the Gemini API of the same account.
// The key is kept in Script Properties, not in this file — run setGeminiKey() once.
// If no key is set, or the call fails, the rule-based parser is used instead.
// ─────────────────────────────────────────────────────────────────────────────
function setGeminiKey(key) {
  PropertiesService.getScriptProperties().setProperty('gemini_key', String(key || '').trim());
  return 'Saved. Run testGemini() to check it.';
}
function geminiKey_() { return PropertiesService.getScriptProperties().getProperty('gemini_key') || ''; }
// Model can be changed without touching the code: script property "gemini_model".
function geminiModel_() { return PropertiesService.getScriptProperties().getProperty('gemini_model') || 'gemini-2.5-flash'; }
// Google retires models from time to time (they stay in models.list but answer 404).
// Try the configured one first, then known-good alternatives, and remember what worked.
var GEMINI_FALLBACKS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-pro'];
function geminiCall_(key, payload) {
  var tried = [], models = [geminiModel_()];
  GEMINI_FALLBACKS.forEach(function (m) { if (models.indexOf(m) < 0) models.push(m); });
  for (var i = 0; i < models.length; i++) {
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(key);
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: payload });
    if (r.getResponseCode() === 200) {
      if (models[i] !== geminiModel_()) PropertiesService.getScriptProperties().setProperty('gemini_model', models[i]);
      return { ok: true, model: models[i], body: r.getContentText() };
    }
    tried.push(models[i] + ' -> HTTP ' + r.getResponseCode());
    if (r.getResponseCode() !== 404) return { ok: false, error: tried.join('; ') + ' | ' + r.getContentText().slice(0, 300) };
  }
  return { ok: false, error: 'No working model. Tried: ' + tried.join('; ') };
}
function setGeminiModel(name) {
  PropertiesService.getScriptProperties().setProperty('gemini_model', String(name || '').trim());
  return 'Model set to ' + geminiModel_();
}

// Full diagnostics: key present? which models are available? what does the API answer?
function diagGemini() {
  var out = [];
  var key = geminiKey_();
  out.push('Key in Script Properties: ' + (key ? 'yes, length ' + key.length : 'NO — add property gemini_key'));
  if (!key) { Logger.log(out.join('\n')); return out.join('\n'); }
  out.push('Model: ' + geminiModel_());

  try {
    var lr = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key), { muteHttpExceptions: true });
    out.push('models.list HTTP ' + lr.getResponseCode());
    if (lr.getResponseCode() === 200) {
      var names = (JSON.parse(lr.getContentText()).models || [])
        .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
        .map(function (m) { return String(m.name).replace('models/', ''); });
      out.push('Available (' + names.length + '): ' + names.slice(0, 25).join(', '));
      if (names.indexOf(geminiModel_()) < 0) out.push('!! Current model is NOT in the list — run setGeminiModel("<one of the above>")');
    } else {
      out.push('Body: ' + lr.getContentText().slice(0, 400));
    }
  } catch (e) { out.push('models.list EXCEPTION: ' + e); }

  try {
    var call = geminiCall_(key, JSON.stringify({ contents: [{ parts: [{ text: 'Reply with {"ok":true} only.' }] }],
                                                 generationConfig: { temperature: 0, responseMimeType: 'application/json' } }));
    if (call.ok) {
      out.push('generateContent OK with model: ' + call.model + (call.model !== geminiModel_() ? ' (saved as default)' : ''));
      out.push('Body: ' + String(call.body).slice(0, 300));
    } else {
      out.push('generateContent FAILED: ' + call.error);
    }
  } catch (e) { out.push('generateContent EXCEPTION: ' + e); }

  var s = out.join('\n');
  Logger.log(s);
  return s;
}

function testGemini() {
  var r = geminiExtract_('AGREEMENT No. TEST/1 dated 5 January 2026 between Alpha Ltd (Supplier) and Beta LLC (Customer). Price: 1,000 EUR. Payment within 30 calendar days.');
  Logger.log(r);
  return r;
}

var AI_FIELDS = [
  'number', 'signDate', 'startDate', 'endDate', 'amount', 'currency', 'pricingType', 'rateBasis',
  'templateType', 'direction', 'subject', 'sowScope',
  'paymentDays', 'acceptanceDays', 'remarksDays', 'noticeDays', 'disputeDays', 'cureDays',
  'termYears', 'warrantyPeriod', 'governingLaw', 'jurisdictionPlace', 'arbitrationBody', 'arbitrationSeat',
  'penaltyDelayPercent', 'penaltyFailurePercent', 'penaltyCapPercent', 'insuranceAmount',
  'restrictedTerritories', 'paymentBasis', 'reportFrequency',
  'replacesIn', 'replacementText',
  'hasAcceptanceAct', 'hasPenalties', 'hasUsageRights', 'hasInsurance', 'hasDataSecurity', 'hasWarranty', 'hasPayoutCurrency'
];


// Minimise what leaves the account: bank details, contacts and identifiers are masked,
// and the parties are replaced by neutral tokens. Amounts, dates and terms are kept —
// they are exactly what we are extracting.

// PDF ligatures often come back from OCR as stray punctuation:
// "Konstan<n" = ti, "Interna]onal" = ti, "Rai\\eisen" = ff. Repair before anything else.
function fixOcrText_(t) {
  t = String(t || '');
  // Drive OCR loses ligatures: ti -> "<" "]" "}", ff -> "\\", fi -> "|" or "a", tt -> "e", ft -> "o".
  t = t.replace(/([A-Za-z])[<\]\}](?=[a-z])/g, '$1ti');
  t = t.replace(/([A-Za-z])\\(?=[a-z])/g, '$1ff');
  t = t.replace(/([A-Za-z])\|(?=[a-z])/g, '$1ti');
  t = t.replace(/([a-z])U(?=[a-z])/g, '$1fi');        // DeUnitions -> Definitions, beneUt -> benefit
  t = t.replace(/([A-Za-z]):(?=[a-z])/g, '$1ff');     // E:ective -> Effective
  // The "fi"/"tt"/"ft" losses cannot be repaired by pattern — repair the words they produce.
  var WORDS = {
    'aoer':'after','aoerwards':'afterwards','wrieen':'written','aeached':'attached','aeachment':'Attachment',
    'aeachments':'attachments','aeempt':'attempt','aeempts':'attempts','maeer':'matter','maeers':'matters',
    'beeer':'better','seeng':'setting','sesng':'setting','lecer':'letter','wrisng':'writing',
    'identiaed':'identified','identiaes':'identifies','modiaed':'modified','modiaca':'modifica',
    'speciaca':'specifica','speciac':'specific','conaden':'confiden','notiaed':'notified','notiaca':'notifica',
    'veriaed':'verified','certiaed':'certified','clariaca':'clarifica','beneat':'benefit','beneats':'benefits',
    'arst':'first','ave':'five','agy':'fifty','ale':'file','ales':'files','aled':'filed','aling':'filing',
    'anal':'final','anally':'finally','ananc':'financ','axed':'fixed','aoen':'often','proat':'profit',
    'proats':'profits','sucient':'sufficient','oer':'offer','oered':'offered','eect':'effect','eective':'effective',
    'jood':'flood','jow':'flow','conjict':'conflict','func]ons':'functions','are':'fire'
  };
  // Stems are repaired without a trailing boundary: "modiaca" also fixes "modiacation".
  var STEMS = { 'modiaca':'modifica', 'speciaca':'specifica', 'notiaca':'notifica', 'clariaca':'clarifica',
                'conaden':'confiden', 'certiaca':'certifica', 'veriaca':'verifica', 'ananc':'financ',
                'identiac':'identific', 'jexib':'flexib', 'proat':'profit', 'beneat':'benefit' };
  Object.keys(WORDS).forEach(function (bad) {
    t = t.replace(new RegExp('\\b' + bad + '\\b', 'g'), WORDS[bad]);
    t = t.replace(new RegExp('\\b' + bad.charAt(0).toUpperCase() + bad.slice(1) + '\\b', 'g'),
                  WORDS[bad].charAt(0).toUpperCase() + WORDS[bad].slice(1));
  });
  Object.keys(STEMS).forEach(function (bad) {
    t = t.replace(new RegExp('\\b' + bad, 'g'), STEMS[bad]);
    t = t.replace(new RegExp('\\b' + bad.charAt(0).toUpperCase() + bad.slice(1), 'g'),
                  STEMS[bad].charAt(0).toUpperCase() + STEMS[bad].slice(1));
  });
  t = t.replace(/\u00ad/g, '');
  // Typographic quotes inside clause text end up inside JSON strings and break the answer.
  t = t.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  return t;
}

// Drive OCR often emits the same page twice (text layer + rendered layer).
// Drive OCR frequently returns each page twice; drop the repeated half before the model sees it.
function dedupePages_(text) {
  var t = String(text || '');
  var half = Math.floor(t.length / 2);
  if (half > 500) {
    var a = t.slice(0, half).replace(/\s+/g, ' ').trim();
    var b = t.slice(half).replace(/\s+/g, ' ').trim();
    if (a && b && (a === b || (a.length > 400 && b.indexOf(a.slice(0, 400)) === 0))) return t.slice(0, half);
  }
  var lines = t.split(/\n/), seen = {}, out = [], run = 0;
  for (var i = 0; i < lines.length; i++) {
    var k = lines[i].replace(/\s+/g, ' ').trim().toLowerCase();
    if (k.length > 60 && seen[k]) { run++; continue; }
    if (k.length > 60) seen[k] = 1;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function dedupeBlocks_(blocks) {
  var seen = {}, out = [];
  blocks.forEach(function (b) {
    var txt = String(b.text || '').replace(/\s+/g, ' ').trim();
    if (!txt) return;
    var kFull = txt.toLowerCase();
    var kHead = kFull.slice(0, 200);
    var kPath = (String(b.path || '') + '|' + String(b.title || '')).trim().toLowerCase();
    if (seen[kFull] || seen[kHead] || (kPath !== '|' && seen['p:' + kPath])) return;
    seen[kFull] = 1; seen[kHead] = 1; if (kPath !== '|') seen['p:' + kPath] = 1;
    out.push(b);
  });
  return out;
}

// Names of everyone we know (counterparties and signatories) plus bank lines are masked,
// so no personal or banking data reaches the model.
function maskNamesAndBanks_(t) {
  var names = [];
  readAll_(SHEETS.counterparties).forEach(function (c) { if (trim_(c.Name).length > 3) names.push(trim_(c.Name)); });
  readAll_(SHEETS.requisites).forEach(function (r) {
    ['SignatoryName', 'BeneficiaryName', 'LegalName'].forEach(function (f) {
      if (trim_(r[f]).length > 3) names.push(trim_(r[f]));
    });
  });
  names.sort(function (a, b) { return b.length - a.length; });          // longest first
  names.forEach(function (n) {
    var esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(esc, 'gi'), '[NAME]');
    var parts = n.split(/\s+/).filter(function (p) { return p.length > 3; });
    parts.forEach(function (p) {
      t = t.replace(new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '[NAME]');
    });
  });
  // whole lines that carry banking details
  t = t.split('\n').map(function (line) {
    return /(account\s*(no|number)|iban|swift|correspondent bank|beneficiary)/i.test(line) ? '[BANK DETAILS]' : line;
  }).join('\n');
  // account-like numbers with dots/dashes, e.g. 000-55.036.222
  t = t.replace(/\b\d[\d]*(?:[.\-]\d+){2,}\b/g, '[ACCOUNT]');
  return t;
}


function maskForAI_(text, counterpartyName) {
  var t = fixOcrText_(text);

  // Party pseudonyms FIRST — otherwise the general name masking turns our own company
  // into [NAME] and the model loses the only clue about who is who.
  var esc = function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var usFull = String(CONFIG.COMPANY_NAME || 'Fraktalex');
  var usShort = usFull.split(/\s+/)[0];
  t = t.replace(new RegExp(esc(usFull), 'gi'), 'PARTY_US');
  t = t.replace(new RegExp('\\b' + esc(usShort) + '\\b', 'gi'), 'PARTY_US');
  if (counterpartyName) {
    var cn = String(counterpartyName).trim();
    if (cn.length > 3) t = t.replace(new RegExp(esc(cn), 'gi'), 'PARTY_OTHER');
    var first = cn.split(/\s+/)[0];
    if (first && first.length > 3) t = t.replace(new RegExp('\\b' + esc(first) + '\\b', 'gi'), 'PARTY_OTHER');
  }

  // Now the rest: people, banks, contacts, identifiers.
  t = maskNamesAndBanks_(t);
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
  t = t.replace(/(?:\+\d[\d ()\-]{7,}\d)/g, '[PHONE]');
  t = t.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[IBAN]');
  // A SWIFT code must be labelled or contain digits — otherwise plain capitalised words match.
  t = t.replace(/(SWIFT|BIC)(\s*(?:code)?\s*:?\s*)([A-Z0-9]{8,11})/gi, '$1$2[SWIFT]');
  t = t.replace(/\b(?=[A-Z0-9]{8,11}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{8,11}\b/g, '[SWIFT]');
  t = t.replace(/\b\d{8,20}\b/g, '[ACCOUNT]');
  t = t.replace(/\b\d{2,4}(?:[-. ]\d{2,4}){2,}\b/g, '[ACCOUNT]');
  // Only mask an account when what follows really looks like an account number —
  // otherwise "to the bank account of the Supplier upon receipt of a corresponding invoice"
  // gets eaten and the clause text is destroyed.
  t = t.replace(/(Account\s*(?:No\.?|number)\s*:?\s*)([A-Z]{0,2}[\d][\d\-. ]{5,30})/gi, '$1[ACCOUNT]');
  // Same for addresses: only when the line is a labelled address field, not any sentence
  // that happens to contain the word.
  t = t.replace(/^([ \t]*(?:Bank\s+)?Address\s*:\s*)([^\n]{5,120})$/gim, '$1[ADDRESS]');
  t = t.replace(/(having its (?:principal )?place of business at\s+)([^\n,]{5,120})/gi, '$1[ADDRESS]');
  return t;
}

// Put the real names back into anything the model wrote out (subject, scope of work).
function unmaskAI_(value, counterpartyName) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/PARTY_US/g, CONFIG.COMPANY_NAME || 'Fraktalex')
    .replace(/PARTY_OTHER/g, counterpartyName || 'the Counterparty')
    .replace(/\[NAME\]/g, CONFIG.COMPANY_NAME || 'Fraktalex')
    .replace(/\[PERSON\]/g, 'the authorised representative');
}

var GEMINI_CP_NAME = '';
function geminiExtract_(text, counterpartyName) {
  GEMINI_CP_NAME = counterpartyName || '';
  var key = geminiKey_();
  if (!key) return null;
  var sent = text;
  var prompt =
    'You are reading a commercial contract. The parties are written as PARTY_US (our company) and PARTY_OTHER.\n' +
    'Personal data, bank details and addresses have been masked as [EMAIL], [PHONE], [IBAN], [ACCOUNT], [ADDRESS] — ignore them.\n' +
    'Extract the fields below and reply with ONE JSON object and nothing else — no prose, no markdown fences.\n' +
    'Use null for anything the text does not state. Never invent values.\n' +
    'Numbers are often written in words with digits in brackets — "within twenty (20) days" means 20. Always return the digits.\n' +
    'In text fields (subject, sowScope) write PARTY_US and PARTY_OTHER for the parties; never copy [NAME], [PERSON] or other placeholders.\n\n' +
    'Fields:\n' +
    '- number: the contract/agreement number exactly as written\n' +
    '- signDate, startDate, endDate: ISO YYYY-MM-DD\n' +
    '- amount: number only (no separators). For an hourly contract this is the hourly rate\n' +
    '- currency: one of USD, EUR, AED, SGD\n' +
    '- pricingType: "hourly" if paid per hour, otherwise "lump"\n' +
    '- rateBasis: e.g. "per hour", "per man-day" (only if hourly)\n' +
    '- templateType: "ica" if this is an independent contractor agreement with a person, else "b2b"\n' +
    '- direction: "incoming" if PARTY_US receives money, "outgoing" if PARTY_US pays\n' +
    '- subject: one short line describing the subject of the contract\n' +
    '- sowScope: the services / deliverables the contract requires, as a plain list, one item per line, no numbering\n' +
    '- sowScope: the list of services/deliverables from the statement of work, one item per line, plain text without numbering\n' +
    '- paymentDays, acceptanceDays, remarksDays, noticeDays, disputeDays, cureDays: integers (days)\n' +
    '- termYears: integer\n' +
    '- warrantyPeriod: as written, e.g. "1.5 (one and a half) months"\n' +
    '- governingLaw, jurisdictionPlace, arbitrationBody, arbitrationSeat: short strings\n' +
    '- penaltyDelayPercent, penaltyFailurePercent, penaltyCapPercent, insuranceAmount: numbers\n' +
    '- restrictedTerritories: territories where work must not be performed\n' +
    '- paymentBasis: "hourly" | "fixed" | "milestone"\n' +
    '- reportFrequency: "on_completion" | "monthly"\n' +
    'Blocks actually present in the text (true/false, use false if absent):\n' +
    '- hasAcceptanceAct: an "Acceptance Act" signed by both parties is required\n' +
    '- hasPenalties: contractual penalties for delay or non-performance\n' +
    '- hasUsageRights: the customer is granted a right to use the deliverables\n' +
    '- hasInsurance: the contractor must maintain professional indemnity insurance\n' +
    '- hasDataSecurity: a data-security / information-protection section is present\n' +
    '- hasWarranty: a warranty for the performed work is given\n' +
    '- hasPayoutCurrency: the contractor may choose the currency of payment\n\n' +
    'CONTRACT TEXT:\n' + String(text).slice(0, 60000);

  try {
    var call = geminiCall_(key, JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    }));
    if (!call.ok) return null;
    var data = JSON.parse(call.body);
    var out = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
              data.candidates[0].content.parts && data.candidates[0].content.parts[0].text;
    if (!out) return null;
    var clean = String(out).replace(/```json|```/g, '').trim();
    var obj = JSON.parse(clean);
    var res = {};
    AI_FIELDS.forEach(function (f) {
      var v = obj[f];
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'boolean') { res[f] = v; return; }
      if (typeof v === 'string') { res[f] = unmaskAI_(v, GEMINI_CP_NAME); return; }
      res[f] = v;
    });
    res.__sent = sent;
    return res;
  } catch (e) { return null; }
}

// Split what the model returned into the main contract fields and the document settings.
var AI_CORE = ['number', 'signDate', 'startDate', 'endDate', 'amount', 'currency', 'pricingType', 'templateType', 'direction'];
function aiSplit_(ai) {
  var core = {}, extras = {};
  for (var k in ai) { if (AI_CORE.indexOf(k) >= 0) core[k] = ai[k]; else extras[k] = ai[k]; }
  return { core: core, extras: extras };
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
  // Contract type: an ICA names a Service Provider / independent contractor;
  // a B2B agreement talks about Supplier and Customer.
  var icaHits = 0, b2bHits = 0;
  if (/independent\s+contractor\s+agreement/i.test(text)) icaHits += 3;
  if (/service\s+provider/i.test(text)) icaHits += 2;
  if (/independent\s+contractor/i.test(text)) icaHits += 1;
  if (/\bsupplier\b/i.test(text)) b2bHits += 2;
  if (/acceptance\s+act/i.test(text)) b2bHits += 2;
  if (/\bdeliverables\b/i.test(text)) b2bHits += 1;
  if (icaHits || b2bHits) f.templateType = (icaHits >= b2bHits) ? 'ica' : 'b2b';
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
    var text = fixOcrText_(String(r.text || ''));
    if (text.replace(/\s/g, '').length < 40) { notes.push(a.FileName + ': no readable text'); continue; }
    var f = parseContractText_(text), ex = parseContractExtras_(text), used = 'rules', sentText = '';
    var cpGuess = guessCounterparty_(text);                       // matched locally, before anything leaves
    var ai = geminiExtract_(maskForAI_(text, cpGuess ? cpGuess.Name : ''), cpGuess ? cpGuess.Name : '');
    if (ai) {
      sentText = ai.__sent || ''; delete ai.__sent;
      var sp = aiSplit_(ai);
      for (var kc in sp.core) f[kc] = sp.core[kc];               // the model wins where it found something
      for (var ke in sp.extras) ex[ke] = sp.extras[ke];
      used = 'AI';
    }
    if (cpGuess) { f.counterpartyId = cpGuess.CounterpartyID; f.counterpartyName = cpGuess.Name; }
    parts.push({ docType: trim_(a.DocType), fileName: a.FileName, fields: f, extras: ex, engine: used, sent: sentText });
    notes.push(a.FileName + ': ' + (Object.keys(f).length ? Object.keys(f).join(', ') : 'nothing recognised'));
  }
  if (!parts.length) return { ok: false, error: notes.join('; ') || 'Nothing could be read' };
  var extras = {};
  parts.forEach(function (p) { for (var k in (p.extras || {})) if (extras[k] === undefined) extras[k] = p.extras[k]; });
  var merged = mergeContractFields_(parts);
  if (!merged.number && !merged.amount && !merged.signDate) return { ok: false, error: 'Text was read, but no contract details were recognised' };
  var engines = parts.map(function (p) { return p.engine; });
  var sentAll = parts.map(function (p) { return p.sent ? ('--- ' + p.fileName + ' ---\n' + p.sent) : ''; }).filter(String).join('\n\n');
  return { ok: true, fields: merged, extras: extras, notes: notes, engine: (engines.indexOf('AI') >= 0 ? 'AI' : 'rules'), sent: sentAll };
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
  var text = fixOcrText_(String(r.text || ''));
  if (text.replace(/\s/g, '').length < 40) { res.warning = 'No readable text found in this file (a low-quality scan?)'; return res; }
  res.fields = parseContractText_(text);
  res.extras = parseContractExtras_(text);
  var cpU = guessCounterparty_(text);
  var aiU = geminiExtract_(maskForAI_(text, cpU ? cpU.Name : ''), cpU ? cpU.Name : '');
  if (aiU) {
    res.sent = aiU.__sent || ''; delete aiU.__sent;
    var spU = aiSplit_(aiU);
    for (var k1 in spU.core) res.fields[k1] = spU.core[k1];
    for (var k2 in spU.extras) res.extras[k2] = spU.extras[k2];
    res.engine = 'AI';
  } else { res.engine = 'rules'; }
  if (cpU) { res.fields.counterpartyId = cpU.CounterpartyID; res.fields.counterpartyName = cpU.Name; }
  if (!res.fields.number && !res.fields.amount && !res.fields.signDate) res.warning = 'Text was read, but no contract details were recognised';
  return res;
}

// Serve a stored file back to the admin page so it can be previewed without
// relying on Drive's iframe (which needs a Google session and third-party cookies).
function adminAttachmentData_(d) {
  requireAdmin_(d);
  var id = trim_(d.driveFileId);
  if (!id) {
    var a = findRow_(SHEETS.attachments, 'AttachmentID', trim_(d.attachmentId));
    if (!a) return { ok: false, error: 'Attachment not found' };
    id = trim_(a.DriveFileID);
  }
  if (!id) return { ok: false, error: 'No stored file' };
  try {
    var f = DriveApp.getFileById(id);
    var blob = f.getBlob();
    var bytes = blob.getBytes();
    if (bytes.length > 12 * 1024 * 1024) return { ok: false, error: 'File is too large to preview here — use "Open in Drive"' };
    return { ok: true, name: f.getName(), mimeType: blob.getContentType(), dataBase64: Utilities.base64Encode(bytes) };
  } catch (e) { return { ok: false, error: 'Could not read the file: ' + e }; }
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
  'PenaltyCapPercent', 'InsuranceAmount', 'RestrictedTerritories', 'RateBasis',
  'PaymentBasis', 'ReportFrequency', 'CompletionDate', 'PMName', 'SowScope', 'ExtractedAt'];
var DOC_FLAGS = ['OptUplift', 'OptAcceptanceAct', 'OptPenalties', 'OptUsageRights', 'OptInsurance', 'OptDataSecurity', 'OptWarranty', 'OptPayoutCurrency', 'ExternalForm'];

function adminSaveContractDoc_(d) {
  requireAdmin_(d);
  var c = findRow_(SHEETS.contracts, 'ContractID', trim_(d.id));
  if (!c) return { ok: false, error: 'Contract not found' };
  // Match incoming keys case-insensitively: the page sends ourRequisiteId, the column is OurRequisiteID.
  var lower = {};
  for (var k in d) lower[String(k).toLowerCase()] = d[k];
  function incoming(field) {
    var a = field.charAt(0).toLowerCase() + field.slice(1);
    if (d[a] !== undefined) return d[a];
    return lower[String(field).toLowerCase()];
  }
  var upd = {};
  DOC_TEXT_FIELDS.forEach(function (f) {
    var v = incoming(f);
    if (v !== undefined) upd[f] = trim_(v);
  });
  DOC_FLAGS.forEach(function (f) {
    var v = incoming(f);
    if (v !== undefined) upd[f] = truthy_(v) ? 'yes' : 'no';
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
  // ship the rate options with the report — one round trip instead of two
  var opts = reportRateOptions_({ assignmentId: a.AssignmentID });
  return { ok: true, assignment: a, items: items, rateOptions: opts.ok ? opts : null };
}

// A report freezes its rate when it is created, which is what protects past work.
// Until it is submitted, though, the choice can still be corrected — the wrong contract
// may have been picked, or the work turned out to be non-contractual after all.
function reportRateOptions_(d) {
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  var cp = findRow_(SHEETS.counterparties, 'Email', normEmail_(a.EmployeeEmail));
  var list = [];
  if (cp) {
    readAll_(SHEETS.contracts).forEach(function (c) {
      if (String(c.CounterpartyID) !== String(cp.CounterpartyID)) return;
      list.push({ id: c.ContractID, number: trim_(c.Number),
                  pricing: (trim_(c.PricingType) === 'hourly') ? 'hourly' : 'lump',
                  amount: num_(c.Amount), currency: trim_(c.Currency) });
    });
  }
  return { ok: true,
           locked: (trim_(a.Status) === 'submitted' || !!trim_(a.AcceptedBy)),
           current: { contractId: trim_(a.ContractID), rate: num_(a.Rate),
                      amount: num_(a.ReportedAmount), currency: trim_(a.Currency),
                      pricing: trim_(a.PricingType), source: trim_(a.RateSource) },
           counterpartyRate: cp ? { rate: num_(cp.Rate), currency: trim_(cp.Currency) } : null,
           contracts: list };
}

function adminSetReportRate_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  if (trim_(a.Status) === 'submitted' || trim_(a.AcceptedBy)) {
    return { ok: false, error: 'The report has been submitted — recall it first to change the rate' };
  }
  var cp = findRow_(SHEETS.counterparties, 'Email', normEmail_(a.EmployeeEmail));
  if (!cp) return { ok: false, error: 'Counterparty not found' };

  var contractId = trim_(d.contractId), upd = {};
  if (contractId) {
    var c = findRow_(SHEETS.contracts, 'ContractID', contractId);
    if (!c) return { ok: false, error: 'Contract not found' };
    if (String(c.CounterpartyID) !== String(cp.CounterpartyID)) return { ok: false, error: 'That contract belongs to another counterparty' };
    var pricing = (trim_(c.PricingType) === 'hourly') ? 'hourly' : 'lump';
    upd.ContractID = contractId;
    upd.RateSource = 'contract';
    upd.PricingType = pricing;
    upd.Currency = CURRENCIES.indexOf(trim_(c.Currency)) >= 0 ? trim_(c.Currency) : trim_(a.Currency);
    upd.Rate = (pricing === 'lump') ? '' : num_(c.Amount);
    upd.ReportedAmount = (pricing === 'lump') ? num_(c.Amount) : round2_(num_(a.ReportedHours) * num_(c.Amount));
    if (pricing === 'lump') upd.ReportedHours = '';
  } else {
    upd.ContractID = '';
    upd.RateSource = 'counterparty';
    upd.PricingType = 'hourly';
    upd.Currency = CURRENCIES.indexOf(trim_(cp.Currency)) >= 0 ? trim_(cp.Currency) : 'USD';
    upd.Rate = num_(cp.Rate);
    upd.ReportedAmount = round2_(num_(a.ReportedHours) * num_(cp.Rate));
  }
  // an override typed by hand wins over whatever the source says
  if (d.rate !== undefined && trim_(d.rate) !== '') {
    upd.Rate = num_(d.rate);
    if (upd.PricingType !== 'lump') upd.ReportedAmount = round2_(num_(a.ReportedHours) * num_(d.rate));
  }
  // an uplift computed on the old fee no longer matches, so it is cleared
  if (truthy_(a.UpliftGranted)) {
    upd.UpliftGranted = 'no'; upd.UpliftPercent = ''; upd.UpliftAmount = '';
    upd.UpliftK1 = ''; upd.UpliftK2 = ''; upd.UpliftK3 = ''; upd.UpliftBase = '';
  }
  upd.UpdatedAt = new Date().toISOString();
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  return { ok: true, rate: upd.Rate, currency: upd.Currency, amount: upd.ReportedAmount, pricing: upd.PricingType };
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

// ── Bank statements: read the file, then match each line to a report ───────────
// A spreadsheet is converted through Drive, which handles xls, xlsx and csv alike.
function adminParseStatement_(d) {
  requireAdmin_(d);
  if (!d.dataBase64) return { ok: false, error: 'No file' };
  var name = trim_(d.fileName) || 'statement';
  var tmp = null, conv = null;
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(d.dataBase64), trim_(d.mimeType) || 'application/vnd.ms-excel', name);
    tmp = DriveApp.createFile(blob);
    // Drive API v3 directly, so no advanced service has to be switched on by hand
    var url = 'https://www.googleapis.com/drive/v3/files/' + tmp.getId() + '/copy?supportsAllDrives=true';
    var resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ name: name + ' (converted)', mimeType: MimeType.GOOGLE_SHEETS }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      return { ok: false, error: 'Could not convert the file (' + resp.getResponseCode() + '). Is it a spreadsheet?' };
    }
    conv = SpreadsheetApp.openById(JSON.parse(resp.getContentText()).id);
    var values = conv.getSheets()[0].getDataRange().getValues();
    var rows = readStatementRows_(values);
    return { ok: true, rows: rows, sheetRows: values.length };
  } catch (e) {
    return { ok: false, error: 'Could not read the file: ' + e };
  } finally {
    try { if (conv) DriveApp.getFileById(conv.getId()).setTrashed(true); } catch (e2) {}
    try { if (tmp) tmp.setTrashed(true); } catch (e3) {}
  }
}

// Statements differ from bank to bank, so the columns are found by their headings.
function readStatementRows_(values) {
  if (!values || !values.length) return [];
  var headRow = -1, cols = {};
  for (var i = 0; i < Math.min(values.length, 15); i++) {
    var row = values[i].map(function (v) { return String(v == null ? '' : v).toLowerCase().trim(); });
    var found = {};
    row.forEach(function (h, j) {
      if (!h) return;
      if (found.date === undefined && /(^|\b)(date|value date|posting date|дата)/.test(h)) found.date = j;
      if (found.amount === undefined && /(amount|credit|debit|sum|сумма)/.test(h) && !/currency/.test(h)) found.amount = j;
      if (found.currency === undefined && /(currency|ccy|валюта)/.test(h)) found.currency = j;
      if (found.ref === undefined && /(reference|details|description|purpose|narrative|назначение|описание)/.test(h)) found.ref = j;
    });
    if (found.date !== undefined && found.amount !== undefined) { headRow = i; cols = found; break; }
  }
  if (headRow < 0) return [];

  var out = [];
  for (var r = headRow + 1; r < values.length; r++) {
    var v = values[r];
    var dt = statementDate_(v[cols.date]);
    var amt = statementAmount_(v[cols.amount]);
    if (!dt || !amt) continue;
    out.push({
      date: dt, amount: Math.abs(amt),
      currency: (cols.currency !== undefined ? trim_(v[cols.currency]).toUpperCase() : ''),
      reference: (cols.ref !== undefined ? trim_(v[cols.ref]) : ''),
      row: r + 1
    });
  }
  return out;
}
function statementDate_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  var t = trim_(v);
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if (m) {
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    var a = +m[1], b = +m[2];
    // 15/06 can only be day/month; 6/15 can only be month/day — decide by the value
    var day = (a > 12 || b > 12) ? (a > 12 ? a : b) : a;
    var mon = (a > 12 || b > 12) ? (a > 12 ? b : a) : b;
    return y + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
  }
  return '';
}
function statementAmount_(v) {
  if (typeof v === 'number') return v;
  var t = trim_(v).replace(/\s|\u00a0/g, '');
  if (!t) return 0;
  // 1.234,56 and 1,234.56 both occur
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  var n = parseFloat(t.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Suggest a report for each line: the amount within 2% and the payment on or after the
// report, closest in time. Nothing is written until the admin confirms.
function matchPayments_(d) {
  var cpId = trim_(d.counterpartyId);
  var lines = d.lines;
  if (typeof lines === 'string') lines = JSON.parse(lines);
  if (!cpId || !lines || !lines.length) return { ok: false, error: 'Pick a counterparty and load a statement' };
  var cp = findRow_(SHEETS.counterparties, 'CounterpartyID', cpId);
  if (!cp) return { ok: false, error: 'Counterparty not found' };
  var email = normEmail_(cp.Email);

  var taken = {};
  paymentsOf_(cpId).forEach(function (p) { if (trim_(p.AssignmentID)) taken[trim_(p.AssignmentID)] = 1; });

  var candidates = readAll_(SHEETS.assignments).filter(function (a) {
    if (normEmail_(a.EmployeeEmail) !== email) return false;
    if (!trim_(a.AcceptedBy)) return false;                 // only accepted work is paid
    return !taken[trim_(a.AssignmentID)];
  }).map(function (a) {
    return { id: trim_(a.AssignmentID), project: trim_(a.ProjectName), title: trim_(a.Title),
             date: String(trim_(a.AcceptedAt) || trim_(a.SubmittedAt)).slice(0, 10),
             amount: reportTotal_(a), currency: trim_(a.Currency) };
  });

  var used = {}, out = [];
  lines.forEach(function (ln) {
    var best = null, bestGap = 1e9;
    candidates.forEach(function (c) {
      if (used[c.id]) return;
      if (ln.currency && c.currency && ln.currency !== c.currency) return;
      var diff = Math.abs(num_(c.amount) - num_(ln.amount));
      if (num_(c.amount) <= 0) return;
      if (diff / num_(c.amount) > 0.02) return;             // 2% tolerance
      if (c.date && ln.date && ln.date < c.date) return;    // a payment follows its report
      var gap = (c.date && ln.date) ? dayGap_(c.date, ln.date) : 9999;
      if (gap < bestGap) { bestGap = gap; best = c; }
    });
    if (best) used[best.id] = 1;
    out.push({ line: ln, match: best, gapDays: best ? bestGap : null,
               diff: best ? round2_(num_(ln.amount) - num_(best.amount)) : null });
  });
  return { ok: true, suggestions: out, candidates: candidates };
}
function dayGap_(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

function paymentsOf_(cpId) {
  return readAll_(SHEETS.payments).filter(function (p) { return String(p.CounterpartyID) === String(cpId); });
}

function adminSavePayments_(d) {
  requireAdmin_(d);
  var cpId = trim_(d.counterpartyId);
  var items = d.items;
  if (typeof items === 'string') items = JSON.parse(items);
  if (!cpId || !items || !items.length) return { ok: false, error: 'Nothing to save' };
  var now = new Date().toISOString(), who = trim_(d.savedBy) || CONFIG.DEFAULT_SIGNATORY, n = 0;
  var existing = paymentsOf_(cpId);
  items.forEach(function (it) {
    var dt = trim_(it.date), amt = num_(it.amount);
    if (!dt || !amt) return;
    var dup = existing.some(function (p) {
      return String(p.PaidAt).slice(0, 10) === dt && Math.abs(num_(p.Amount) - amt) < 0.005
             && trim_(p.Reference) === trim_(it.reference);
    });
    if (dup) return;
    appendRow_(SHEETS.payments, {
      PaymentID: Utilities.getUuid(), CounterpartyID: cpId, PaidAt: dt, Amount: amt,
      Currency: trim_(it.currency), Reference: trim_(it.reference), Note: trim_(it.note),
      AssignmentID: trim_(it.assignmentId), MatchedBy: trim_(it.assignmentId) ? who : '',
      MatchedAt: trim_(it.assignmentId) ? now.slice(0, 10) : '', CreatedAt: now
    });
    n++;
  });
  return { ok: true, added: n };
}

// Wipe the recorded payments of one counterparty — a statement loaded by mistake would
// otherwise have to be unpicked line by line.
function adminDeletePayments_(d) {
  requireAdmin_(d);
  var cpId = trim_(d.counterpartyId);
  if (!cpId) return { ok: false, error: 'Pick a counterparty' };
  var n = paymentsOf_(cpId).length;
  deleteRowsWhere_(SHEETS.payments, 'CounterpartyID', cpId);
  return { ok: true, deleted: n };
}

function adminUnmatchPayment_(d) {
  requireAdmin_(d);
  var p = findRow_(SHEETS.payments, 'PaymentID', trim_(d.paymentId));
  if (!p) return { ok: false, error: 'Payment not found' };
  updateRow_(SHEETS.payments, 'PaymentID', p.PaymentID, { AssignmentID: '', MatchedBy: '', MatchedAt: '' });
  return { ok: true };
}

// ── Costs per contract and per non-contract project ───────────────────────────
// Sub-contracts count at their agreed price — the commitment, not what has been
// reported so far. Reports count separately, split into accepted (already owed) and
// submitted-but-not-yet-accepted (likely to be owed). Drafts and recalled ones count
// for nothing. Currencies are kept apart and also converted to USD for comparison.
function reportDateOf_(a) {
  return String(trim_(a.AcceptedAt) || trim_(a.SubmittedAt) || trim_(a.ReleasedAt) || '').slice(0, 10);
}
function reportTotal_(a) {
  var fee = num_(a.ReportedAmount);
  if (!fee) fee = round2_(num_(a.ReportedHours) * num_(a.Rate));
  var up = truthy_(a.UpliftGranted) ? num_(a.UpliftAmount) : 0;
  return round2_(fee + up);
}
function addTo_(bucket, currency, amount, dateStr) {
  var c = trim_(currency) || 'USD';
  bucket.by[c] = round2_((bucket.by[c] || 0) + num_(amount));
  var usd = toUsd_(c, amount, dateStr);
  bucket.usd = round2_(bucket.usd + (usd == null ? 0 : usd));
  return bucket;
}
function emptyBucket_() { return { by: {}, usd: 0 }; }

// Convert without hitting the rates API for every row: contracts already store their own
// USD value, and for the rest one rate per currency is enough for a comparison figure.
var USD_RATE_CACHE = {};
function toUsd_(currency, amount, dateStr) {
  var c = trim_(currency).toUpperCase();
  if (!c || c === 'USD') return num_(amount);
  var key = c;
  if (USD_RATE_CACHE[key] === undefined) {
    var fx = computeFx_(c, 1, dateStr || new Date().toISOString().slice(0, 10));
    USD_RATE_CACHE[key] = (fx && num_(fx.FxRate)) ? num_(fx.FxRate) : null;
  }
  var r = USD_RATE_CACHE[key];
  return (r == null) ? null : round2_(num_(amount) * r);
}

function costReport_(d) {
  USD_RATE_CACHE = {};
  var from = trim_(d.from), to = trim_(d.to);
  var inRange = function (dt) {
    if (!dt) return !from && !to;
    if (from && dt < from) return false;
    if (to && dt > to) return false;
    return true;
  };

  var contracts = readAll_(SHEETS.contracts);
  var projects = readAll_(SHEETS.projects);
  var assignments = readAll_(SHEETS.assignments);
  var byId = {}, projById = {};
  contracts.forEach(function (c) { byId[c.ContractID] = c; });
  projects.forEach(function (p) { projById[p.ProjectID] = p; });
  var topOf = function (id) {
    var c = byId[id];
    if (!c) return '';
    return trim_(c.ParentContractID) ? trim_(c.ParentContractID) : String(c.ContractID);
  };

  // A report carries two links: the contract the performer works under (their ICA), and the
  // contract the work is done for (through the project). Both views are needed — one shows
  // what a performer has earned, the other what a job has cost across everyone on it.
  var byPerformer = {}, byJob = {};
  function bucketFor(store, id) {
    if (!store[id]) store[id] = { cost: emptyBucket_(), pending: emptyBucket_(), reports: 0,
                                  reportsPending: 0, people: {} };
    return store[id];
  }

  assignments.forEach(function (a) {
    var st = trim_(a.Status), dt = reportDateOf_(a);
    if (st === 'recalled' || st === 'draft' || st === 'released') return;
    if (!inRange(dt)) return;
    var amount = reportTotal_(a);
    var who = trim_(a.EmployeeName) || trim_(a.EmployeeEmail);
    var accepted = !!trim_(a.AcceptedBy);

    var perfTop = topOf(trim_(a.ContractID));
    if (perfTop) {
      var b = bucketFor(byPerformer, perfTop);
      if (accepted) { addTo_(b.cost, a.Currency, amount, dt); b.reports++; }
      else if (st === 'submitted') { addTo_(b.pending, a.Currency, amount, dt); b.reportsPending++; }
    }

    var pr = projById[a.ProjectID];
    var jobTop = pr ? topOf(trim_(pr.ContractID)) : '';
    if (jobTop) {
      var j = bucketFor(byJob, jobTop);
      if (!j.people[who]) j.people[who] = emptyBucket_();
      if (accepted) { addTo_(j.cost, a.Currency, amount, dt); addTo_(j.people[who], a.Currency, amount, dt); j.reports++; }
      else if (st === 'submitted') { addTo_(j.pending, a.Currency, amount, dt); j.reportsPending++; }
    }
  });

  var rows = [];
  contracts.forEach(function (c) {
    if (trim_(c.ParentContractID)) return;
    var id = String(c.ContractID);
    var subs = contracts.filter(function (x) { return String(x.ParentContractID) === id; });
    var subCost = emptyBucket_(), subList = [];
    subs.forEach(function (x) {
      if (!inRange(String(trim_(x.SignDate)).slice(0, 10))) return;
      addTo_(subCost, x.Currency, x.Amount, trim_(x.SignDate));
      subList.push({ number: trim_(x.Number), who: cpName_(x.CounterpartyID),
                     amount: num_(x.Amount), currency: trim_(x.Currency) });
    });
    subList.sort(function (a, b) { return num_(b.amount) - num_(a.amount); });
    var perf = byPerformer[id] || { cost: emptyBucket_(), pending: emptyBucket_(), reports: 0, reportsPending: 0 };
    var job = byJob[id] || { cost: emptyBucket_(), pending: emptyBucket_(), reports: 0, reportsPending: 0, people: {} };
    var people = Object.keys(job.people).map(function (n) { return { who: n, cost: job.people[n] }; })
                       .sort(function (x, y) { return y.cost.usd - x.cost.usd; });
    rows.push({
      id: id, number: trim_(c.Number), counterparty: cpName_(c.CounterpartyID),
      direction: trim_(c.Direction), currency: trim_(c.Currency), amount: num_(c.Amount),
      startDate: trim_(c.StartDate) || trim_(c.SignDate), endDate: trim_(c.EndDate),
      amountUsd: num_(c.AmountUSD) || toUsd_(c.Currency, c.Amount, c.SignDate),
      subCount: subs.length, subCost: subCost, subs: subList,
      // what the counterparty of this contract has earned under it
      ownCost: perf.cost, ownPending: perf.pending, ownReports: perf.reports, ownPending_n: perf.reportsPending,
      // what the work under this contract has cost, across every performer
      jobCost: job.cost, jobPending: job.pending, jobReports: job.reports, people: people
    });
  });

  // Work that is not tied to any job contract: the project has none, so nothing was billed
  // on to a client. The performer may still be on their own contract — that is a different
  // question, answered by "Earned under it" above.
  var offRows = {};
  assignments.forEach(function (a) {
    var st = trim_(a.Status), dt = reportDateOf_(a);
    if (st === 'recalled' || st === 'draft' || st === 'released') return;
    if (!inRange(dt)) return;
    var pr = projById[a.ProjectID];
    if (pr && trim_(pr.ContractID)) return;
    var key = String(a.ProjectID || 'none');
    if (!offRows[key]) offRows[key] = { project: trim_(a.ProjectName) || (pr ? trim_(pr.Name) : ''),
                                        customer: trim_(a.Customer), people: {}, cost: emptyBucket_(),
                                        pending: emptyBucket_(), reports: 0 };
    var row = offRows[key];
    var pc = trim_(a.ContractID) ? trim_((byId[trim_(a.ContractID)] || {}).Number) : '';
    var who = (trim_(a.EmployeeName) || trim_(a.EmployeeEmail)) + (pc ? ' · ' + pc : '');
    if (!row.people[who]) row.people[who] = emptyBucket_();
    if (trim_(a.AcceptedBy)) { addTo_(row.cost, a.Currency, reportTotal_(a), dt);
                               addTo_(row.people[who], a.Currency, reportTotal_(a), dt); row.reports++; }
    else if (st === 'submitted') { addTo_(row.pending, a.Currency, reportTotal_(a), dt); }
  });

  var noContract = 0;
  projects.forEach(function (p) { if (!trim_(p.ContractID)) noContract++; });

  var trace = [];
  assignments.forEach(function (a) {
    var direct = trim_(a.ContractID);
    var pr = projById[a.ProjectID];
    var viaProject = pr ? trim_(pr.ContractID) : '';
    trace.push({
      project: trim_(a.ProjectName), who: trim_(a.EmployeeName) || trim_(a.EmployeeEmail),
      status: trim_(a.Status), accepted: !!trim_(a.AcceptedBy), date: reportDateOf_(a),
      amount: reportTotal_(a), currency: trim_(a.Currency),
      directContract: direct ? (byId[direct] ? trim_(byId[direct].Number) : direct + ' (missing)') : '',
      projectContract: viaProject ? (byId[viaProject] ? trim_(byId[viaProject].Number) : viaProject + ' (missing)') : '',
      countedUnder: [ topOf(direct) ? trim_((byId[topOf(direct)] || {}).Number) + ' (performer)' : '',
                      topOf(viaProject) ? trim_((byId[topOf(viaProject)] || {}).Number) + ' (job)' : ''
                    ].filter(String).join(' · ') || '(not counted)'
    });
  });

  return { ok: true, from: from, to: to, contracts: rows, projectsNoContract: noContract, trace: trace,
           offContract: Object.keys(offRows).map(function (k) { return offRows[k]; }) };
}

// ── Performance uplift ────────────────────────────────────────────────────────
// Discretionary by design: nothing is added unless it is granted for that report.
// The base defaults to what the amendment says but can be overridden per report,
// so the ceiling is recalculated from whatever base is actually used.
var UPLIFT_DEFAULTS = { base: 5, k1Min: 1, k1Max: 1.5, k2Min: 1, k2Max: 1.6, k3Min: 1, k3Max: 1.25 };

function upliftSettings_(c) {
  function pick(v, d) { var n = num_(v); return (v === '' || v == null || isNaN(n) || n <= 0) ? d : n; }
  return {
    enabled: truthy_(c && c.OptUplift),
    base:  pick(c && c.UpliftBase,  UPLIFT_DEFAULTS.base),
    k1Min: pick(c && c.UpliftK1Min, UPLIFT_DEFAULTS.k1Min), k1Max: pick(c && c.UpliftK1Max, UPLIFT_DEFAULTS.k1Max),
    k2Min: pick(c && c.UpliftK2Min, UPLIFT_DEFAULTS.k2Min), k2Max: pick(c && c.UpliftK2Max, UPLIFT_DEFAULTS.k2Max),
    k3Min: pick(c && c.UpliftK3Min, UPLIFT_DEFAULTS.k3Min), k3Max: pick(c && c.UpliftK3Max, UPLIFT_DEFAULTS.k3Max)
  };
}
function upliftMax_(st) { return round2_(st.base * st.k1Max * st.k2Max * st.k3Max); }

function clampK_(v, lo, hi) {
  var n = num_(v);
  if (isNaN(n) || n <= 0) n = lo;
  return Math.min(hi, Math.max(lo, n));
}

// Returns the percentage, the money and the coefficients actually used.
function computeUplift_(st, feeBase, k1, k2, k3, base) {
  var b = (base === '' || base == null) ? st.base : num_(base);
  if (isNaN(b) || b < 0) b = st.base;
  var a = clampK_(k1, st.k1Min, st.k1Max),
      c2 = clampK_(k2, st.k2Min, st.k2Max),
      c3 = clampK_(k3, st.k3Min, st.k3Max);
  var pct = round2_(b * a * c2 * c3);
  // The percentage stays exact; only the money is rounded, to the nearest whole unit
  // (a half goes up). The total payable is left as it is.
  var amt = Math.round(num_(feeBase) * pct / 100);
  return { base: b, k1: a, k2: c2, k3: c3, percent: pct, amount: amt };
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

// Prefill for the acceptance dialog: whoever signs for us on the related contract,
// falling back to our own default requisite set.
// What the dialog needs to show: the ranges from the contract and whatever is stored already.
function upliftFor_(d) {
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  var c = trim_(a.ContractID) ? findRow_(SHEETS.contracts, 'ContractID', a.ContractID) : null;
  var st = upliftSettings_(c);
  var fee = num_(a.ReportedAmount);
  if (!fee) fee = round2_(num_(a.ReportedHours) * num_(a.Rate));
  return { ok: true, settings: st, max: upliftMax_(st), fee: fee, currency: trim_(a.Currency),
           granted: truthy_(a.UpliftGranted),
           base: a.UpliftBase === '' || a.UpliftBase == null ? st.base : num_(a.UpliftBase),
           k1: num_(a.UpliftK1) || st.k1Min, k2: num_(a.UpliftK2) || st.k2Min, k3: num_(a.UpliftK3) || st.k3Min,
           percent: num_(a.UpliftPercent), amount: num_(a.UpliftAmount), note: trim_(a.UpliftNote),
           setBy: trim_(a.UpliftSetBy), setAt: trim_(a.UpliftSetAt), accepted: !!trim_(a.AcceptedBy) };
}

// Revising an uplift after acceptance changes what is payable, so it is recorded who did it.
function adminSetUplift_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  var who = trim_(d.setBy) || trim_(a.AcceptedBy) || CONFIG.DEFAULT_SIGNATORY;
  var up = applyUpliftFields_(a, d, who);
  up.fields.UpdatedAt = new Date().toISOString();
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, up.fields);
  return { ok: true, uplift: up.info };
}

// Diagnostic: reports whose e-mail matches no counterparty — usually the address was
// changed at some point and the older rows kept the previous one.
function orphanReports_() {
  var emails = {};
  readAll_(SHEETS.counterparties).forEach(function (c) { if (trim_(c.Email)) emails[normEmail_(c.Email)] = trim_(c.Name); });
  var out = [];
  readAll_(SHEETS.assignments).forEach(function (a) {
    var e = normEmail_(a.EmployeeEmail);
    if (!e || !emails[e]) out.push({ id: a.AssignmentID, email: trim_(a.EmployeeEmail), name: trim_(a.EmployeeName),
                                     project: trim_(a.ProjectName), status: trim_(a.Status) });
  });
  return { ok: true, orphans: out };
}

function adminAcceptDefaults_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  var name = '', title = '';
  if (a && trim_(a.ContractID)) {
    var c = findRow_(SHEETS.contracts, 'ContractID', a.ContractID);
    if (c && trim_(c.OurRequisiteID)) {
      var r = reqOf_(c.OurRequisiteID);
      name = trim_(r.SignatoryName); title = trim_(r.SignatoryTitle);
    }
  }
  if (!name) {
    var us = findRow_(SHEETS.counterparties, 'Name', CONFIG.COMPANY_NAME);
    if (us) {
      var dr = defaultRequisite_(us.CounterpartyID);
      if (dr) { name = trim_(dr.SignatoryName); title = trim_(dr.SignatoryTitle); }
    }
  }
  if (!name) { name = CONFIG.DEFAULT_SIGNATORY; title = CONFIG.DEFAULT_SIGNATORY_TITLE; }
  if (!title) title = CONFIG.DEFAULT_SIGNATORY_TITLE;
  return { ok: true, acceptedBy: name, acceptedTitle: title, signatories: CONFIG.SIGNATORIES,
           // default to the day the report was submitted — acceptance normally follows it,
           // and typing today's date by habit would misdate the payment term
           acceptedAt: (a && trim_(a.AcceptedAt)) || (a && trim_(a.SubmittedAt).slice(0, 10))
                       || new Date().toISOString().slice(0, 10) };
}

// Countersigning the report = acceptance and the trigger for payment (ICA clauses 3.2-3.4).
// Shared by acceptance and by a later revision: work out what to store for the uplift.
function applyUpliftFields_(a, d, who) {
  var c = trim_(a.ContractID) ? findRow_(SHEETS.contracts, 'ContractID', a.ContractID) : null;
  var st = upliftSettings_(c);
  if (!st.enabled || !truthy_(d.upliftGranted)) {
    return { fields: { UpliftGranted: 'no', UpliftPercent: '', UpliftAmount: '',
                       UpliftK1: '', UpliftK2: '', UpliftK3: '', UpliftBase: '',
                       UpliftNote: trim_(d.upliftNote),
                       UpliftSetBy: who || '', UpliftSetAt: new Date().toISOString().slice(0, 10) },
             info: { granted: false } };
  }
  var fee = num_(a.ReportedAmount);
  if (!fee) fee = round2_(num_(a.ReportedHours) * num_(a.Rate));
  var r = computeUplift_(st, fee, d.upliftK1, d.upliftK2, d.upliftK3, d.upliftBase);
  return { fields: { UpliftGranted: 'yes', UpliftBase: r.base, UpliftK1: r.k1, UpliftK2: r.k2, UpliftK3: r.k3,
                     UpliftPercent: r.percent, UpliftAmount: r.amount, UpliftNote: trim_(d.upliftNote),
                     UpliftSetBy: who || '', UpliftSetAt: new Date().toISOString().slice(0, 10) },
           info: { granted: true, percent: r.percent, amount: r.amount, fee: fee,
                   total: round2_(fee + r.amount), k1: r.k1, k2: r.k2, k3: r.k3, base: r.base } };
}

function adminAcceptAssignment_(d) {
  requireAdmin_(d);
  var a = findRow_(SHEETS.assignments, 'AssignmentID', trim_(d.assignmentId));
  if (!a) return { ok: false, error: 'Report not found' };
  if (a.Status !== 'submitted') return { ok: false, error: 'Only a submitted report can be accepted' };
  var revoke = truthy_(d.revoke);
  if (revoke) {
    updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, { AcceptedBy: '', AcceptedTitle: '', AcceptedAt: '', UpdatedAt: new Date().toISOString() });
    return { ok: true, revoked: true };
  }
  var by = trim_(d.acceptedBy);
  if (!by) return { ok: false, error: 'Enter the name of the person accepting the report' };
  var date = trim_(d.acceptedAt) || new Date().toISOString().slice(0, 10);
  var title = trim_(d.acceptedTitle);
  var upd = { AcceptedBy: by, AcceptedTitle: title, AcceptedAt: date, UpdatedAt: new Date().toISOString() };
  var res = { ok: true, acceptedBy: by, acceptedTitle: title, acceptedAt: date };
  var up = applyUpliftFields_(a, d, by);
  for (var k in up.fields) upd[k] = up.fields[k];
  res.uplift = up.info;
  updateRow_(SHEETS.assignments, 'AssignmentID', a.AssignmentID, upd);
  return res;
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
  // ship the rate options with the report — one round trip instead of two
  var opts = reportRateOptions_({ assignmentId: a.AssignmentID });
  return { ok: true, assignment: a, items: items, rateOptions: opts.ok ? opts : null };
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
// Opening the spreadsheet is not free either — do it once per request.
// The header check is what makes the sheets self-healing, but it read row 1 on every single
// call — and with dozens of lookups per request that alone cost seconds. Check each sheet
// once per request instead; a write invalidates the cached rows, not this handle.
var SHEET_HANDLES = {};
function getSheet_(name) {
  if (SHEET_HANDLES[name]) return SHEET_HANDLES[name];
  var ss = ss_(), sh = ss.getSheetByName(name), want = HEADERS[keyByName_(name)];
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(want); sh.setFrozenRows(1);
    SHEET_HANDLES[name] = sh;
    return sh;
  }
  var lastCol = sh.getLastColumn();
  var have = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (!headersMatch_(have, want)) {
    if (sh.getLastRow() <= 1) {
      sh.clear(); sh.getRange(1, 1, 1, want.length).setValues([want]); sh.setFrozenRows(1);
    } else {
      migrateSheet_(sh, have, want);   // preserve data: remap by column name
    }
  }
  SHEET_HANDLES[name] = sh;
  return sh;
}

var SS_HANDLE = null;
function ss_() {
  if (SS_HANDLE) return SS_HANDLE;
  SS_HANDLE = CONFIG.SHEET_ID ? SpreadsheetApp.openById(CONFIG.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return SS_HANDLE;
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
// A sheet is read once per request and then served from memory: findRow_ used to pull the
// whole sheet again on every call, so one request could re-read the same sheet dozens of
// times. The cache is dropped as soon as anything is written, so nothing goes stale.
var SHEET_CACHE = {};
function invalidateCache_(name) {
  if (name) delete SHEET_CACHE[name]; else SHEET_CACHE = {};
}
function readAll_(name) {
  if (SHEET_CACHE[name]) return SHEET_CACHE[name];
  var sh = getSheet_(name), values = sh.getDataRange().getValues();
  if (values.length < 2) { SHEET_CACHE[name] = []; return SHEET_CACHE[name]; }
  var head = values[0], out = [];
  for (var i = 1; i < values.length; i++) { var o = {}; for (var j = 0; j < head.length; j++) o[head[j]] = values[i][j]; out.push(o); }
  SHEET_CACHE[name] = out;
  return out;
}
var TEXT_COLS = ['Number', 'RegNumber', 'AccountNumber', 'Swift', 'CorrSwift', 'Phone', 'Title', 'FileName', 'Path', 'ReplacesPath', 'ReplacesIn', 'SemanticKey', 'FromClause', 'Field'];
function appendRow_(name, obj) {
  invalidateCache_(name);
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
  invalidateCache_(name);
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
  invalidateCache_(name);
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
  getSheet_(SHEETS.counterparties); getSheet_(SHEETS.requisites); getSheet_(SHEETS.documents); getSheet_(SHEETS.blocks); getSheet_(SHEETS.terms); getSheet_(SHEETS.payments); getSheet_(SHEETS.employees); getSheet_(SHEETS.contracts); getSheet_(SHEETS.invoices); getSheet_(SHEETS.attachments); getSheet_(SHEETS.projects); getSheet_(SHEETS.assignments); getSheet_(SHEETS.entries);
  ensureCounterparties_();
  SpreadsheetApp.getActive().toast('Sheets created.');
}
