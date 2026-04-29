document.addEventListener("DOMContentLoaded", async () => {
  try {
    cacheDomElements();
    bindEvents();

    const access = await window.SessionManager.protectPage([
      "hr",
      "hr_manager",
    ]);

    if (!access) return;

    state.currentUser = access.session.user;
    state.currentProfile = access.profile;

    await loadLatestHrProfile();

    renderHrProfile(state.currentProfile, access.session.user);
    switchHrWorkspace("profile");
    resetEmployeeForm();

    // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 5
    // Build the Pay Cycle dropdown dynamically before resetting the payroll form.
    populatePayrollPayCycleOptions();

    resetPayrollForm();

    // =========================================================
    // DESCRIPTION ITEM 1
    // Initialise the new payroll master workspace as part of
    // HR payroll page load.
    // =========================================================
    // =========================================================
    // DESCRIPTION ITEM 2
    // Initialise allowance workspace as part of HR payroll load.
    // =========================================================
    await refreshEmployeeWorkspace();
    await refreshPayrollMasterWorkspace();
    await refreshPayrollAllowanceWorkspace();
    await refreshPayrollWorkspace();

    // BANK DIRECTORY - STEP 7A
    // Load saved banks from Supabase so Bank Directory records survive page refresh.
    await refreshBankDirectoryWorkspace();

    // EMPLOYEE BANK DETAILS - STEP 8A
    // Load saved employee bank details on page start after employees and banks
    // are already available, so the Employee Bank Records table is populated
    // when HR opens the payroll workspace.
    await refreshEmployeeBankDetailsWorkspace();

    window.hrEditEmployee = (employeeId) => {
      startEmployeeEdit(employeeId);
    };

    window.hrViewEmployeeDocuments = (employeeId) => {
      startEmployeeEdit(employeeId, { focusDocuments: true });
    };

    // DESCRIPTION ITEM 9 - STEP 1
    // Expose payroll selection toggle for the checkbox column
    // in the Full Employee List table.
    window.hrToggleEmployeePayrollSelection = (employeeId, isChecked) => {
      toggleEmployeePayrollSelection(employeeId, isChecked);
    };

    // BATCH PAYROLL DEFAULT - STEP 11
// Expose the remove action used by the Batch Payroll Review table.
window.hrRemoveEmployeeFromPayrollBatch = (employeeId) => {
  removeEmployeeFromCurrentPayrollBatch(employeeId);
};

    window.hrOpenEmployeeDocument = async (documentId) => {
      await openEmployeeDocument(documentId);
    };

    window.hrEditPayrollRecord = (payrollId) => {
      startPayrollEdit(payrollId);
    };

    // DESCRIPTION ITEM 4 - STEP 7
    // Expose payslip preview action for the Payroll Records table.
    // This only opens a review modal for finalised payroll records.
    window.hrPreviewPayslipRecord = async (payrollId) => {
      await openPayslipPreview(payrollId);
    };

    // =========================================================
    // DESCRIPTION ITEM 2
    // Expose allowance edit handler for table action buttons.
    // =========================================================
    window.hrEditPayrollAllowanceRecord = (allowanceId) => {
      startPayrollAllowanceEdit(allowanceId);
    };
    // =========================================================
    // DESCRIPTION ITEM 1
    // Expose payroll master edit handler for table action buttons.
    // =========================================================
    window.hrEditPayrollMasterRecord = (payrollMasterId) => {
      startPayrollMasterEdit(payrollMasterId);
    };

    // BANK DIRECTORY - STEP 8
    // Expose Bank Directory edit action for the table button.
    window.hrEditBankDirectoryRecord = (bankId) => {
      startBankDirectoryEdit(bankId);
    };

    // EMPLOYEE BANK DETAILS - STEP 9
    // Expose Employee Bank Details edit action for the table button.
    window.hrEditEmployeeBankDetailsRecord = (employeeBankDetailsId) => {
      startEmployeeBankDetailsEdit(employeeBankDetailsId);
    };

  } catch (error) {
    console.error("Error initialising HR dashboard:", error);
    showPageAlert(
      "danger",
      error.message ||
      "An unexpected error occurred while loading the HR dashboard.",
    );
  }
});

const EMPLOYEE_DOCUMENTS_BUCKET = "employee-documents";
const PROFILE_IMAGES_BUCKET = "profile-images";

const state = {
  currentUser: null,
  currentProfile: null,
  employees: [],
  filteredEmployees: [],

  // DESCRIPTION ITEM 9 - STEP 1
  // Keeps the current page-session selection of employees marked
  // for monthly payroll processing from the Full Employee List.
  selectedEmployeesForPayroll: new Set(),
  // BATCH PAYROLL DEFAULT - STEP 1
  // Tracks when the employee table is being used specifically for Run Payroll.
  // In this mode, the employee list should show active employees only,
  // because inactive employees should not be prepared for a new payroll batch.
  isRunPayrollSelectionMode: false,
  // BATCH PAYROLL DEFAULT - STEP 5
  // Holds calculated payroll rows prepared from the Batch Payroll Review table.
  // This is in-memory only for now. No payroll records are saved in this step.
  batchPayrollPreparedRows: [],

  payrollRecords: [],
  filteredPayrollRecords: [],

  // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
  // Tracks payroll records just submitted/updated in the current browser session
  // so they can be shown first after refresh.
  lastSavedPayrollRecordIds: new Set(),

  // DESCRIPTION ITEM 4 - STEP 6
  // Holds payslip email audit/status logs loaded from Supabase.
  // These records are created by Send Payslips and later move from
  // Pending to Sent/Failed when real email delivery is configured.
  payslipEmailLogs: [],
  filteredPayslipEmailLogs: [],

  // =========================================================
  // DESCRIPTION ITEM 1
  // Payroll master record state holders
  // These will hold the new employee salary master records.
  // =========================================================
  payrollMasterRecords: [],
  filteredPayrollMasterRecords: [],

  // =========================================================
  // DESCRIPTION ITEM 2
  // Allowance component state holders
  // These will hold allowance rows linked to payroll master data.
  // =========================================================
  payrollAllowanceComponents: [],
  filteredPayrollAllowanceComponents: [],

  // BANK DIRECTORY - STEP 5
  // Temporary in-page bank directory records.
  // Database persistence will be added after the UI behaviour is confirmed.
  bankDirectoryRecords: [],
  filteredBankDirectoryRecords: [],

  // EMPLOYEE BANK DETAILS - STEP 8
  // Holds employee bank account records loaded from Supabase
  // so the records table can reflect saved bank details immediately.
  employeeBankDetailsRecords: [],
  filteredEmployeeBankDetailsRecords: [],

  currentEditingEmployee: null,
  currentEditingPayroll: null,

  // =========================================================
  // DESCRIPTION ITEM 1
  // Tracks the payroll master record currently being edited.
  // =========================================================
  currentEditingPayrollMaster: null,

  // =========================================================
  // DESCRIPTION ITEM 2
  // Tracks the allowance component currently being edited.
  // =========================================================
  currentEditingPayrollAllowance: null,

  // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2 FIX
  // Tracks the allowance just created/updated in the current browser session
  // so it can be shown first after refresh, even when records have different
  // effective dates.
  lastSavedPayrollAllowanceKey: null,

  // BANK DIRECTORY - STEP 8D
  // Tracks the bank currently being edited so Save Bank can update instead of creating a duplicate.
  currentEditingBankDirectory: null,

  // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3 FIX
  // Tracks the bank just created/updated in the current browser session
  // so it can be shown first after refresh, even if Supabase returns banks
  // alphabetically.
  lastSavedBankDirectoryKey: null,
  // EMPLOYEE BANK DETAILS - STEP 9
  // Tracks the employee bank detail currently being edited so Save updates
  // the existing row instead of creating another bank account record.
  currentEditingEmployeeBankDetails: null,

  // HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
  // Tracks the employee bank detail just created/updated in the current
  // browser session so it can be shown first after refresh.
  lastSavedEmployeeBankDetailsKey: null,

  pendingFiles: [],
  attachedDocuments: [],
  allEmployeeDocuments: [],
  authProfiles: [],
  pendingProfileImageFile: null,
  dom: {},
};

function getSupabaseClient() {
  if (!window.supabaseClient) {
    throw new Error(
      "Supabase client is not available on window.supabaseClient.",
    );
  }
  return window.supabaseClient;
}

function cacheDomElements() {
  state.dom = {
    pageAlert: document.getElementById("pageAlert"),

    logoutBtn: document.getElementById("logoutBtn"),
    resetEmployeeFormBtn: document.getElementById("resetEmployeeFormBtn"),
    refreshEmployeesBtn: document.getElementById("refreshEmployeesBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),

    hrTabProfileBtn: document.getElementById("hrTabProfileBtn"),
    hrTabEmployeesBtn: document.getElementById("hrTabEmployeesBtn"),
    hrTabPayrollBtn: document.getElementById("hrTabPayrollBtn"),

    // RUN PAYROLL - STEP 1
    // Cache the primary Run Payroll workflow button in the HR workspace header.
    runPayrollActionBtn: document.getElementById("runPayrollActionBtn"),

    hrProfileSection: document.getElementById("hrProfileSection"),
    hrEmployeesSection: document.getElementById("hrEmployeesSection"),
    hrPayrollSection: document.getElementById("hrPayrollSection"),

    hrInitials: document.getElementById("hrInitials"),
    hrHeroImage: document.getElementById("hrHeroImage"),
    hrEmail: document.getElementById("hrEmail"),
    hrRole: document.getElementById("hrRole"),
    hrModuleValue: document.getElementById("hrModuleValue"),

    hrProfileAvatar: document.getElementById("hrProfileAvatar"),
    hrProfileCardName: document.getElementById("hrProfileCardName"),
    hrProfileCardEmail: document.getElementById("hrProfileCardEmail"),
    hrProfileForm: document.getElementById("hrProfileForm"),
    hrProfileFullName: document.getElementById("hrProfileFullName"),
    hrProfileEmail: document.getElementById("hrProfileEmail"),
    hrProfileRole: document.getElementById("hrProfileRole"),
    hrProfileDepartment: document.getElementById("hrProfileDepartment"),
    saveHrProfileBtn: document.getElementById("saveHrProfileBtn"),

    hrProfileImageInput: document.getElementById("hrProfileImageInput"),
    hrProfileImagePreview: document.getElementById("hrProfileImagePreview"),
    saveHrProfileImageBtn: document.getElementById("saveHrProfileImageBtn"),

    totalEmployeesValue: document.getElementById("totalEmployeesValue"),
    activeEmployeesValue: document.getElementById("activeEmployeesValue"),
    departmentsValue: document.getElementById("departmentsValue"),
    missingEmployeeNumberValue: document.getElementById(
      "missingEmployeeNumberValue",
    ),

    employeeCreateForm: document.getElementById("employeeCreateForm"),
    saveEmployeeBtn: document.getElementById("saveEmployeeBtn"),
    saveEmployeeBtnText: document.getElementById("saveEmployeeBtnText"),
    employeeFormTitle: document.getElementById("employeeFormTitle"),
    employeeFormSubtext: document.getElementById("employeeFormSubtext"),
    employeeFormModeBadge: document.getElementById("employeeFormModeBadge"),
    editingEmployeeId: document.getElementById("editingEmployeeId"),

firstName: document.getElementById("firstName"),

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
// Optional Middle Name field for fuller employee identity records.
middleName: document.getElementById("middleName"),

lastName: document.getElementById("lastName"),
workEmail: document.getElementById("workEmail"),
phoneNumber: document.getElementById("phoneNumber"),
    department: document.getElementById("department"),
    jobTitle: document.getElementById("jobTitle"),

    lineManager: document.getElementById("lineManager"),
    employmentDate: document.getElementById("employmentDate"),
    approverEmail: document.getElementById("approverEmail"),
    employeeNumber: document.getElementById("employeeNumber"),
    employmentStatus: document.getElementById("employmentStatus"),
    systemRole: document.getElementById("systemRole"),

    employeeAccountStatusBadge: document.getElementById(
      "employeeAccountStatusBadge",
    ),
    employeeLinkedEmailValue: document.getElementById(
      "employeeLinkedEmailValue",
    ),
    employeePhotoSetupValue: document.getElementById(
      "employeePhotoSetupValue",
    ),

    employeeDocumentsInput: document.getElementById("employeeDocumentsInput"),

    // DESCRIPTION ITEM 10 - STEP 1
    // Cache the document type selector so the next step can persist
    // the selected classification with each uploaded file.
    employeeDocumentType: document.getElementById("employeeDocumentType"),

    clearPendingDocumentsBtn: document.getElementById(
      "clearPendingDocumentsBtn",
    ),
    pendingDocumentsEmptyState: document.getElementById(
      "pendingDocumentsEmptyState",
    ),
    pendingDocumentsList: document.getElementById("pendingDocumentsList"),
    attachedDocumentsEmptyState: document.getElementById(
      "attachedDocumentsEmptyState",
    ),
    attachedDocumentsList: document.getElementById("attachedDocumentsList"),

    employeeSearchInput: document.getElementById("employeeSearchInput"),

    // DESCRIPTION ITEM 9 - STEP 2
    // Master payroll selection checkbox for the visible employee list.
    selectAllEmployeesForPayroll: document.getElementById(
      "selectAllEmployeesForPayroll",
    ),

    // DESCRIPTION ITEM 9 - STEP 3
    // Live summary text showing how many employees are currently selected
    // for this month's payroll run.
    employeePayrollSelectionSummary: document.getElementById(
      "employeePayrollSelectionSummary",
    ),

    // RUN PAYROLL - STEP 2
    // Notice shown when the employee list is being used for payroll selection.
    runPayrollSelectionNotice: document.getElementById("runPayrollSelectionNotice"),

    // RUN PAYROLL - STEP 3
    // Shows selected employee count and controls the next payroll action.
    runPayrollSelectedCount: document.getElementById("runPayrollSelectedCount"),
    continueRunPayrollBtn: document.getElementById("continueRunPayrollBtn"),

    employeeRecordsEmptyState: document.getElementById(
      "employeeRecordsEmptyState",
    ),
    employeeRecordsTableWrapper: document.getElementById(
      "employeeRecordsTableWrapper",
    ),
    employeeRecordsTableBody: document.getElementById(
      "employeeRecordsTableBody",
    ),
    // DESCRIPTION ITEM 1 - STEP 5
    // Collapse controls for the HR employee form card and employee list card.
    toggleEmployeeFormCardBtn: document.getElementById("toggleEmployeeFormCardBtn"),
    employeeFormCardCollapse: document.getElementById("employeeFormCardCollapse"),
    toggleEmployeeListCardBtn: document.getElementById("toggleEmployeeListCardBtn"),
    employeeListCardCollapse: document.getElementById("employeeListCardCollapse"),

    // REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
    // Header target used after create/update so the Full Employee List title
    // is visible and not cut off at the top of the viewport.
    employeeListCardHeader: document.getElementById("employeeListCardHeader"),

    payrollRecordCountValue: document.getElementById("payrollRecordCountValue"),
    payrollFinalisedCountValue: document.getElementById("payrollFinalisedCountValue"),
    payrollGrossTotalValue: document.getElementById("payrollGrossTotalValue"),
    payrollNetTotalValue: document.getElementById("payrollNetTotalValue"),

    payrollSearchInput: document.getElementById("payrollSearchInput"),
    payrollStatusFilter: document.getElementById("payrollStatusFilter"),

    // PAYROLL EXPORT - DESCRIPTION ITEM 3 - STEP 4A FIX
    // Cache export pay cycle selector and CSV button.
    exportPayrollPayCycle: document.getElementById("exportPayrollPayCycle"),
    exportPayrollCsvBtn: document.getElementById("exportPayrollCsvBtn"),

    // DESCRIPTION ITEM 4 - STEP 3
    // Cache Send Payslips button so it can be enabled only when
    // finalised payroll records exist for the selected action cycle.
    sendPayslipsEmailBtn: document.getElementById("sendPayslipsEmailBtn"),

    // DESCRIPTION ITEM 4 - STEP 5B
    // Cache Payslip Email Status compact panel controls.
    // These are only for expand/collapse and future summary counts.
    togglePayslipEmailLogsBtn: document.getElementById("togglePayslipEmailLogsBtn"),
    payslipEmailLogsCollapse: document.getElementById("payslipEmailLogsCollapse"),
    payslipEmailPendingCount: document.getElementById("payslipEmailPendingCount"),
    payslipEmailSentCount: document.getElementById("payslipEmailSentCount"),
    payslipEmailFailedCount: document.getElementById("payslipEmailFailedCount"),
    refreshPayslipEmailLogsBtn: document.getElementById("refreshPayslipEmailLogsBtn"),
    payslipEmailLogsEmptyState: document.getElementById("payslipEmailLogsEmptyState"),
    payslipEmailLogsTableWrapper: document.getElementById("payslipEmailLogsTableWrapper"),
    payslipEmailLogsTableBody: document.getElementById("payslipEmailLogsTableBody"),

    refreshPayrollRecordsBtn: document.getElementById("refreshPayrollRecordsBtn"),
    payrollRecordsEmptyState: document.getElementById("payrollRecordsEmptyState"),
    payrollRecordsTableWrapper: document.getElementById("payrollRecordsTableWrapper"),
    payrollRecordsTableBody: document.getElementById("payrollRecordsTableBody"),

    // DESCRIPTION ITEM 4 - STEP 7
    // Cache Payslip Preview modal elements.
    // This is only for HR review; it does not send emails.
    payslipPreviewModal: document.getElementById("payslipPreviewModal"),
    payslipPreviewTitle: document.getElementById("payslipPreviewTitle"),
    payslipPreviewContent: document.getElementById("payslipPreviewContent"),
    closePayslipPreviewBtn: document.getElementById("closePayslipPreviewBtn"),
    closePayslipPreviewFooterBtn: document.getElementById("closePayslipPreviewFooterBtn"),
    // SUBMIT PAYROLL - DESCRIPTION ITEM 2
    // Stable Payroll Records card target used after successful submit.
    payrollRecordsCard: document.getElementById("payrollRecordsCard"),

    // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
    // Header target used after submit/update so Payroll Records appears
    // cleanly without the heading being cut off.
    payrollRecordsHeader: document.getElementById("payrollRecordsHeader"),
    // =========================================================
    // DESCRIPTION ITEM 1
    // Payroll master form DOM cache
    // These fields belong to the new payroll master data section.
    // =========================================================
    payrollMasterCreateForm: document.getElementById("payrollMasterCreateForm"),

    // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 3
    // Collapse controls for the Payroll Master Data card.
    payrollMasterCardCollapse: document.getElementById("payrollMasterCardCollapse"),
    togglePayrollMasterCardBtn: document.getElementById("togglePayrollMasterCardBtn"),

    // BANK DIRECTORY - STEP 2
    // Cache collapse container and toggle button for Bank Directory.
    bankDirectoryCardCollapse: document.getElementById("bankDirectoryCardCollapse"),
    toggleBankDirectoryCardBtn: document.getElementById("toggleBankDirectoryCardBtn"),

    // EMPLOYEE BANK DETAILS - STEP 3
    // Cache collapse container and toggle button for Employee Bank Details.
    // This makes the new Employee Bank Details card behave like Bank Directory.
    employeeBankDetailsCardCollapse: document.getElementById("employeeBankDetailsCardCollapse"),
    toggleEmployeeBankDetailsCardBtn: document.getElementById("toggleEmployeeBankDetailsCardBtn"),

    // EMPLOYEE BANK DETAILS - STEP 4
    // Cache Employee Bank Details form fields so the dropdowns can be populated
    // from existing HR employee records and active Bank Directory records.
    employeeBankDetailsForm: document.getElementById("employeeBankDetailsForm"),
    editingEmployeeBankDetailsId: document.getElementById("editingEmployeeBankDetailsId"),
    employeeBankEmployeeId: document.getElementById("employeeBankEmployeeId"),
    employeeBankBankId: document.getElementById("employeeBankBankId"),
    employeeBankCode: document.getElementById("employeeBankCode"),
    employeeBankAccountNumber: document.getElementById("employeeBankAccountNumber"),
    employeeBankAccountName: document.getElementById("employeeBankAccountName"),
    employeeBankStatus: document.getElementById("employeeBankStatus"),
    saveEmployeeBankDetailsBtn: document.getElementById("saveEmployeeBankDetailsBtn"),
    employeeBankDetailsSubmitLabel: document.getElementById("employeeBankDetailsSubmitLabel"),
    cancelEmployeeBankDetailsEditBtn: document.getElementById("cancelEmployeeBankDetailsEditBtn"),
    employeeBankDetailsSearchInput: document.getElementById("employeeBankDetailsSearchInput"),

    // HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
    // Header target used after create/update so Employee Bank Records appears
    // cleanly without the heading being cut off.
    employeeBankDetailsRecordsHeader: document.getElementById("employeeBankDetailsRecordsHeader"),

    employeeBankDetailsEmptyState: document.getElementById("employeeBankDetailsEmptyState"),
    employeeBankDetailsTableWrapper: document.getElementById("employeeBankDetailsTableWrapper"),
    employeeBankDetailsTableBody: document.getElementById("employeeBankDetailsTableBody"),

    // BANK DIRECTORY - STEP 4
    // Cache controlled bank directory fields.
    bankDirectoryForm: document.getElementById("bankDirectoryForm"),
    bankName: document.getElementById("bankName"),
    bankCode: document.getElementById("bankCode"),
    bankStatus: document.getElementById("bankStatus"),

    // BANK DIRECTORY - STEP 10B
    // Cache the Save/Update Bank label correctly.
    // This was previously swallowed by a comment, so edit/create label changes
    // were not reliably controlled by JavaScript.
    bankDirectorySubmitLabel: document.getElementById("bankDirectorySubmitLabel"),
    cancelBankDirectoryEditBtn: document.getElementById("cancelBankDirectoryEditBtn"),

    // BANK DIRECTORY - STEP 8I
    // Cache Save Bank button so it can be disabled until the form is valid.
    saveBankDirectoryBtn: document.getElementById("saveBankDirectoryBtn"),

    // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
    // Header target used after create/update so Bank Directory Records appears
    // cleanly without the heading being cut off.
    bankDirectoryRecordsHeader: document.getElementById("bankDirectoryRecordsHeader"),

    bankDirectorySearchInput: document.getElementById("bankDirectorySearchInput"),
    bankDirectoryEmptyState: document.getElementById("bankDirectoryEmptyState"),
    bankDirectoryTableWrapper: document.getElementById("bankDirectoryTableWrapper"),
    bankDirectoryTableBody: document.getElementById("bankDirectoryTableBody"),

    payrollMasterFormModeBadge: document.getElementById("payrollMasterFormModeBadge"),
    editingPayrollMasterId: document.getElementById("editingPayrollMasterId"),
    cancelPayrollMasterEditBtn: document.getElementById("cancelPayrollMasterEditBtn"),
    resetPayrollMasterFormBtn: document.getElementById("resetPayrollMasterFormBtn"),
    refreshPayrollMasterRecordsBtn: document.getElementById("refreshPayrollMasterRecordsBtn"),
    savePayrollMasterBtn: document.getElementById("savePayrollMasterBtn"),
    savePayrollMasterBtnText: document.getElementById("savePayrollMasterBtnText"),

    payrollMasterEmployeeId: document.getElementById("payrollMasterEmployeeId"),

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
    // Grade has been removed from Payroll Master Data.
    // Payroll Master now uses Employee + Salary + Effective Date + Pay Cycle + Status.
    payrollMasterBasicSalary: document.getElementById("payrollMasterBasicSalary"),
    payrollMasterEffectiveDate: document.getElementById("payrollMasterEffectiveDate"),
    payrollMasterPayCycle: document.getElementById("payrollMasterPayCycle"),
    payrollMasterStatus: document.getElementById("payrollMasterStatus"),
    payrollMasterNotes: document.getElementById("payrollMasterNotes"),

    payrollMasterSearchInput: document.getElementById("payrollMasterSearchInput"),

    // HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
    // Header target used after create/update so Payroll Master Records
    // appears cleanly without the heading being cut off.
    payrollMasterRecordsHeader: document.getElementById("payrollMasterRecordsHeader"),

    payrollMasterRecordsEmptyState: document.getElementById("payrollMasterRecordsEmptyState"),
    payrollMasterRecordsTableWrapper: document.getElementById("payrollMasterRecordsTableWrapper"),
    payrollMasterRecordsTableBody: document.getElementById("payrollMasterRecordsTableBody"),

    // =========================================================
    // DESCRIPTION ITEM 2
    // Allowance Components form DOM cache
    // These fields belong to the new allowance section.
    // =========================================================
    payrollAllowanceCreateForm: document.getElementById("payrollAllowanceCreateForm"),

    // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 4
    // Collapse controls for the Allowance Components card.
    togglePayrollAllowanceCardBtn: document.getElementById("togglePayrollAllowanceCardBtn"),
    payrollAllowanceCardCollapse: document.getElementById("payrollAllowanceCardCollapse"),

    payrollAllowanceFormModeBadge: document.getElementById("payrollAllowanceFormModeBadge"),
    editingPayrollAllowanceId: document.getElementById("editingPayrollAllowanceId"),
    cancelPayrollAllowanceEditBtn: document.getElementById("cancelPayrollAllowanceEditBtn"),
    resetPayrollAllowanceFormBtn: document.getElementById("resetPayrollAllowanceFormBtn"),
    refreshPayrollAllowanceRecordsBtn: document.getElementById("refreshPayrollAllowanceRecordsBtn"),
    savePayrollAllowanceBtn: document.getElementById("savePayrollAllowanceBtn"),
    savePayrollAllowanceBtnText: document.getElementById("savePayrollAllowanceBtnText"),

    payrollAllowanceMasterRecordId: document.getElementById("payrollAllowanceMasterRecordId"),
    payrollAllowanceType: document.getElementById("payrollAllowanceType"),
    payrollAllowanceAmount: document.getElementById("payrollAllowanceAmount"),
    payrollAllowanceEffectiveDate: document.getElementById("payrollAllowanceEffectiveDate"),
    payrollAllowanceStatus: document.getElementById("payrollAllowanceStatus"),
    payrollAllowanceNotes: document.getElementById("payrollAllowanceNotes"),

    payrollAllowanceSearchInput: document.getElementById("payrollAllowanceSearchInput"),

    // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
    // Header target used after create/update so Allowance Records appears
    // cleanly without the heading being cut off.
    payrollAllowanceRecordsHeader: document.getElementById("payrollAllowanceRecordsHeader"),

    payrollAllowanceRecordsEmptyState: document.getElementById("payrollAllowanceRecordsEmptyState"),
    payrollAllowanceRecordsTableWrapper: document.getElementById("payrollAllowanceRecordsTableWrapper"),
    payrollAllowanceRecordsTableBody: document.getElementById("payrollAllowanceRecordsTableBody"),

    payrollCreateForm: document.getElementById("payrollCreateForm"),

    // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 5
    // Collapse controls for the Create Payroll Record card.
    togglePayrollRecordCardBtn: document.getElementById("togglePayrollRecordCardBtn"),
    payrollRecordCardCollapse: document.getElementById("payrollRecordCardCollapse"),

    payrollFormTitle: document.getElementById("payrollFormTitle"),
    payrollFormSubtext: document.getElementById("payrollFormSubtext"),
    payrollFormModeBadge: document.getElementById("payrollFormModeBadge"),
    editingPayrollId: document.getElementById("editingPayrollId"),
    cancelPayrollEditBtn: document.getElementById("cancelPayrollEditBtn"),
    resetPayrollFormBtn: document.getElementById("resetPayrollFormBtn"),
    savePayrollBtn: document.getElementById("savePayrollBtn"),
    savePayrollBtnText: document.getElementById("savePayrollBtnText"),
    // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 3
    // Top shortcut button for submitting long payroll forms.
    topSubmitPayrollBtn: document.getElementById("topSubmitPayrollBtn"),
    // BATCH PAYROLL DEFAULT - STEP 2
    // Cache the batch payroll review panel shown after HR selects
    // employees from the Run Payroll table.
    batchPayrollReviewPanel: document.getElementById("batchPayrollReviewPanel"),
    batchPayrollReviewCount: document.getElementById("batchPayrollReviewCount"),
    batchPayrollReviewTableBody: document.getElementById("batchPayrollReviewTableBody"),
    // BATCH PAYROLL DEFAULT - STEP 7
    // Saves prepared batch payroll rows into Payroll Records.
    submitBatchPayrollBtn: document.getElementById("submitBatchPayrollBtn"),
    // BATCH PAYROLL DEFAULT - STEP 6B
    // Batch payroll period controls used by the batch submit flow.
    // These are separate from the hidden individual payroll form fields.
    batchPayrollPayCycle: document.getElementById("batchPayrollPayCycle"),
    batchPayrollPayDate: document.getElementById("batchPayrollPayDate"),

    // BATCH PAYROLL DEFAULT - STEP 4
    // Shows a clear warning when selected employees do not have
    // a valid active Payroll Master setup for batch payroll.
    batchPayrollSetupWarning: document.getElementById("batchPayrollSetupWarning"),

    payrollEmployeeId: document.getElementById("payrollEmployeeId"),

    // DESCRIPTION ITEM 2 - STEP 1
    // Read-only payroll employee reference panel sourced from HR.
    payrollSelectedEmployeeReferenceEmptyState: document.getElementById(
      "payrollSelectedEmployeeReferenceEmptyState",
    ),
    payrollSelectedEmployeeReferenceDetails: document.getElementById(
      "payrollSelectedEmployeeReferenceDetails",
    ),
    payrollSelectedEmployeeNumber: document.getElementById(
      "payrollSelectedEmployeeNumber",
    ),
    payrollSelectedEmployeeEmail: document.getElementById(
      "payrollSelectedEmployeeEmail",
    ),
    payrollSelectedEmployeeDepartment: document.getElementById(
      "payrollSelectedEmployeeDepartment",
    ),
    payrollSelectedEmployeeJobTitle: document.getElementById(
      "payrollSelectedEmployeeJobTitle",
    ),
    payrollSelectedEmployeeStatus: document.getElementById(
      "payrollSelectedEmployeeStatus",
    ),

    // PAYROLL BANK READINESS - STEP 11B
    // Cache the Payroll Bank Readiness panel fields inside Selected Employee Reference.
    // These fields show whether the selected employee has active bank details
    // before HR submits payroll.
    payrollBankReadinessBadge: document.getElementById("payrollBankReadinessBadge"),
    payrollBankReadinessEmptyState: document.getElementById("payrollBankReadinessEmptyState"),
    payrollBankReadinessDetails: document.getElementById("payrollBankReadinessDetails"),
    payrollBankReadinessBankName: document.getElementById("payrollBankReadinessBankName"),
    payrollBankReadinessBankCode: document.getElementById("payrollBankReadinessBankCode"),
    payrollBankReadinessAccountNumber: document.getElementById("payrollBankReadinessAccountNumber"),
    payrollBankReadinessAccountName: document.getElementById("payrollBankReadinessAccountName"),
    payrollBankReadinessWarning: document.getElementById("payrollBankReadinessWarning"),

    // PAYROLL BANK READINESS - STEP 11C
    // Soft warning near Submit Payroll.
    // This is advisory only and does not block payroll submission.
    payrollBankReadinessSubmitWarning: document.getElementById(
      "payrollBankReadinessSubmitWarning",
    ),

    payrollPayCycle: document.getElementById("payrollPayCycle"),
    payrollPayDate: document.getElementById("payrollPayDate"),
    payrollEmployeeGroup: document.getElementById("payrollEmployeeGroup"),
    payrollModel: document.getElementById("payrollModel"),
    alpatechRegularRev2Section: document.getElementById("alpatechRegularRev2Section"),
    regularIncrementPercent: document.getElementById("regularIncrementPercent"),
    regularIncrementAmount: document.getElementById("regularIncrementAmount"),
    regularMeritIncrement: document.getElementById("regularMeritIncrement"),
    regularNewBaseSalary: document.getElementById("regularNewBaseSalary"),
    regularBasicPercent: document.getElementById("regularBasicPercent"),
    regularHousingPercent: document.getElementById("regularHousingPercent"),
    regularTransportPercent: document.getElementById("regularTransportPercent"),
    regularUtilityPercent: document.getElementById("regularUtilityPercent"),
    regularOtherAllowancePercent: document.getElementById("regularOtherAllowancePercent"),
    regularBht: document.getElementById("regularBht"),
    regularNetSalary: document.getElementById("regularNetSalary"),
    regularMonthlySalaryPlusLogistics: document.getElementById("regularMonthlySalaryPlusLogistics"),
    payrollStatus: document.getElementById("payrollStatus"),

    // PAYROLL STRUCTURE PREVIEW - STEP 12D
    // Cache the compact payroll structure preview panel.
    payrollStructurePreviewPanel: document.getElementById("payrollStructurePreviewPanel"),
    payrollStructurePreviewTitle: document.getElementById("payrollStructurePreviewTitle"),
    payrollStructurePreviewBadge: document.getElementById("payrollStructurePreviewBadge"),
    payrollStructurePreviewDescription: document.getElementById("payrollStructurePreviewDescription"),
    payrollStructurePreviewItems: document.getElementById("payrollStructurePreviewItems"),

    payrollReference: document.getElementById("payrollReference"),
    payrollBaseSalary: document.getElementById("payrollBaseSalary"),
    payrollBasicPay: document.getElementById("payrollBasicPay"),
    payrollHousingAllowance: document.getElementById("payrollHousingAllowance"),
    payrollTransportAllowance: document.getElementById("payrollTransportAllowance"),
    payrollUtilityAllowance: document.getElementById("payrollUtilityAllowance"),
    payrollMedicalAllowance: document.getElementById("payrollMedicalAllowance"),
    payrollOtherAllowance: document.getElementById("payrollOtherAllowance"),
    payrollBonus: document.getElementById("payrollBonus"),
    payrollOvertime: document.getElementById("payrollOvertime"),
    payrollLogisticsAllowance: document.getElementById("payrollLogisticsAllowance"),
    payrollDataAirtimeAllowance: document.getElementById("payrollDataAirtimeAllowance"),
    payrollGrossPay: document.getElementById("payrollGrossPay"),
payrollPayeTax: document.getElementById("payrollPayeTax"),

// PAYROLL TAX DEDUCTION CALCULATION - STEP 2
// Helper note shown only when NTA 2025 PAYE calculates as zero.
payrollPayeTaxNote: document.getElementById("payrollPayeTaxNote"),

payrollWhtTax: document.getElementById("payrollWhtTax"),
    payrollEmployeePension: document.getElementById("payrollEmployeePension"),
    payrollEmployerPension: document.getElementById("payrollEmployerPension"),
    payrollOtherDeductions: document.getElementById("payrollOtherDeductions"),
    payrollTotalDeductions: document.getElementById("payrollTotalDeductions"),
    payrollNetPay: document.getElementById("payrollNetPay"),
    payrollCurrency: document.getElementById("payrollCurrency"),
    payrollIsFinalised: document.getElementById("payrollIsFinalised"),
    payrollNotes: document.getElementById("payrollNotes"),

    // BATCH PAYROLL DEFAULT - STEP 6D
    // Floating page-level shortcut for long HR/payroll screens.
    backToTopBtn: document.getElementById("backToTopBtn"),
        // BATCH PAYROLL DEFAULT - STEP 8A
    // Floating notification card used for important blocking messages.
    dashboardToast: document.getElementById("dashboardToast"),
    dashboardToastAccent: document.getElementById("dashboardToastAccent"),
    dashboardToastIcon: document.getElementById("dashboardToastIcon"),
    dashboardToastTitle: document.getElementById("dashboardToastTitle"),
    dashboardToastMessage: document.getElementById("dashboardToastMessage"),
    dashboardToastCloseBtn: document.getElementById("dashboardToastCloseBtn"),
  };
}
// DESCRIPTION ITEM 1 - STEP 5
// Simple reusable collapse toggle for HR dashboard cards.
// Uses d-none so we do not depend on external collapse plugins.
function bindCardCollapseToggle(button, panel) {
  if (!button || !panel) return;

  button.addEventListener("click", () => {
    const isNowHidden = panel.classList.toggle("d-none");
    button.setAttribute("aria-expanded", String(!isNowHidden));

    const icon = button.querySelector("i");
    const label = button.querySelector("span");

    if (icon) {
      icon.className = isNowHidden
        ? "bi bi-chevron-down me-2"
        : "bi bi-chevron-up me-2";
    }

    if (label) {
      label.textContent = isNowHidden ? "Expand" : "Collapse";
    }
  });
}

// REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
// Programmatic version of the existing card collapse behaviour.
// This lets save/edit flows open or close cards without duplicating UI logic.
function setDashboardCardExpanded(button, panel, shouldExpand) {
  if (!button || !panel) return;

  panel.classList.toggle("d-none", !shouldExpand);
  button.setAttribute("aria-expanded", String(shouldExpand));

  const icon = button.querySelector("i");
  const label = button.querySelector("span");

  if (icon) {
    icon.className = shouldExpand
      ? "bi bi-chevron-up me-2"
      : "bi bi-chevron-down me-2";
  }

  if (label) {
    label.textContent = shouldExpand ? "Collapse" : "Expand";
  }
}

// REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
// Scroll with an offset so card headings remain visible after redirect.
function scrollToDashboardTarget(target, offset = 96) {
  if (!target) return;

  const targetTop =
    target.getBoundingClientRect().top + window.pageYOffset - offset;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: "smooth",
  });
}
// BATCH PAYROLL DEFAULT - STEP 6D
// Show the Back to Top button only after HR has scrolled down.
// This keeps the page clean near the top but helpful on long HR/payroll screens.
function updateBackToTopButtonVisibility() {
  const button = state.dom.backToTopBtn;
  if (!button) return;

  const shouldShow = window.scrollY > 420;
  button.classList.toggle("d-none", !shouldShow);
}

// BATCH PAYROLL DEFAULT - STEP 8A
// Shows a bottom-right notification for important messages that HR must
// see immediately, even when the normal page alert is outside the viewport.
function showDashboardToast(type = "warning", title = "Notification", message = "") {
  const toast = state.dom.dashboardToast;
  if (!toast) return;

  const accent = state.dom.dashboardToastAccent;
  const icon = state.dom.dashboardToastIcon;
  const titleEl = state.dom.dashboardToastTitle;
  const messageEl = state.dom.dashboardToastMessage;

  const themeMap = {
    success: {
      accentClass: "bg-success",
      iconClass: "text-bg-success",
      iconHtml: '<i class="bi bi-check-circle"></i>',
    },
    warning: {
      accentClass: "bg-warning",
      iconClass: "text-bg-warning",
      iconHtml: '<i class="bi bi-exclamation-triangle"></i>',
    },
    danger: {
      accentClass: "bg-danger",
      iconClass: "text-bg-danger",
      iconHtml: '<i class="bi bi-x-octagon"></i>',
    },
    info: {
      accentClass: "bg-primary",
      iconClass: "text-bg-primary",
      iconHtml: '<i class="bi bi-info-circle"></i>',
    },
  };

  const theme = themeMap[type] || themeMap.info;

  if (accent) {
    accent.className = theme.accentClass;
    accent.style.height = "4px";
  }

  if (icon) {
    icon.className =
      `rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${theme.iconClass}`;
    icon.style.width = "36px";
    icon.style.height = "36px";
    icon.innerHTML = theme.iconHtml;
  }

  if (titleEl) {
    titleEl.textContent = title;
  }

  if (messageEl) {
    messageEl.innerHTML = message || "";
  }

  toast.classList.remove("d-none");

  window.clearTimeout(state.dashboardToastTimeoutId);

  state.dashboardToastTimeoutId = window.setTimeout(() => {
    hideDashboardToast();
  }, 8000);
}

// BATCH PAYROLL DEFAULT - STEP 8A
// Hides the bottom-right notification without changing any page data.
function hideDashboardToast() {
  state.dom.dashboardToast?.classList.add("d-none");

  if (state.dashboardToastTimeoutId) {
    window.clearTimeout(state.dashboardToastTimeoutId);
    state.dashboardToastTimeoutId = null;
  }
}

// BATCH PAYROLL DEFAULT - STEP 6D
// Smoothly return HR to the top of the dashboard.
function scrollDashboardBackToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
// REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
// Keep Employee Management save/edit navigation consistent.
function openEmployeeFormCard() {
  setDashboardCardExpanded(
    state.dom.toggleEmployeeFormCardBtn,
    state.dom.employeeFormCardCollapse,
    true,
  );
}

function closeEmployeeFormCard() {
  setDashboardCardExpanded(
    state.dom.toggleEmployeeFormCardBtn,
    state.dom.employeeFormCardCollapse,
    false,
  );
}

function openEmployeeListCard() {
  setDashboardCardExpanded(
    state.dom.toggleEmployeeListCardBtn,
    state.dom.employeeListCardCollapse,
    true,
  );
}

// REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 4
// After save, land at the start of the Full Employee List card.
// Use the parent card as the scroll target so the card starts cleanly
// without leaving a large blank gap above the heading.
function redirectToFullEmployeeListAfterEmployeeSave() {
  closeEmployeeFormCard();
  openEmployeeListCard();

  const employeeListCard =
    state.dom.employeeListCardCollapse?.closest(".dashboard-section-card") ||
    state.dom.employeeListCardHeader ||
    state.dom.employeeListCardCollapse;

  scrollToDashboardTarget(employeeListCard, 16);
}

// REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
// Latest created/updated employee records should be shown first.
// This is display-only and does not alter saved database values.
function sortEmployeeRecordsByLatestActivity(records = []) {
  return [...records].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    return bTime - aTime;
  });
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
// Payroll Master Data has its form and records inside one collapsible card.
// Therefore, after save we keep the card open and scroll to the records section.
function openPayrollMasterCard() {
  setDashboardCardExpanded(
    state.dom.togglePayrollMasterCardBtn,
    state.dom.payrollMasterCardCollapse,
    true,
  );
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
// Redirect to Payroll Master Records after create/update.
// This replaces the older raw scrollIntoView behaviour with the shared
// offset-based scroll helper so the heading remains visible.
function redirectToPayrollMasterRecordsAfterSave() {
  openPayrollMasterCard();

  scrollToDashboardTarget(
    state.dom.payrollMasterRecordsHeader ||
    state.dom.payrollMasterRecordsTableWrapper ||
    state.dom.payrollMasterCardCollapse,
    16,
  );
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
// Show latest created/updated payroll master records first.
// Display-only; this does not change saved Supabase data.
function sortPayrollMasterRecordsByLatestActivity(records = []) {
  return [...records].sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    return bTime - aTime;
  });
}

// HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
// Allowance Components has its form and records inside one collapsible card.
// Therefore, after save we keep the card open and scroll to the records section.
function openPayrollAllowanceCard() {
  setDashboardCardExpanded(
    state.dom.togglePayrollAllowanceCardBtn,
    state.dom.payrollAllowanceCardCollapse,
    true,
  );
}

// HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
// Redirect to Allowance Records after create/update.
// This uses the shared offset-based scroll helper so the heading remains visible.
function redirectToPayrollAllowanceRecordsAfterSave() {
  openPayrollAllowanceCard();

  scrollToDashboardTarget(
    state.dom.payrollAllowanceRecordsHeader ||
    state.dom.payrollAllowanceRecordsTableWrapper ||
    state.dom.payrollAllowanceCardCollapse,
    16,
  );
}

// HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2 FIX
// Stable key used to identify the allowance that was just saved/updated.
function buildPayrollAllowanceSortKey(record = {}) {
  const id = String(record.id || "").trim();

  if (id) {
    return `id:${id}`;
  }

  return [
    "fallback",
    normalizeText(record.payroll_master_record_id),
    normalizeText(record.allowance_type),
    String(record.effective_date || "").trim(),
  ].join("|");
}

// HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2 FIX
// Show the allowance just created/updated first.
// Then fall back to updated/created timestamp.
// Finally fall back to effective date so the rest of the list remains sensible.
function sortPayrollAllowanceRecordsByLatestActivity(records = []) {
  const lastSavedKey = String(state.lastSavedPayrollAllowanceKey || "").trim();

  return [...records].sort((a, b) => {
    const aKey = buildPayrollAllowanceSortKey(a);
    const bKey = buildPayrollAllowanceSortKey(b);

    if (lastSavedKey && aKey === lastSavedKey && bKey !== lastSavedKey) {
      return -1;
    }

    if (lastSavedKey && bKey === lastSavedKey && aKey !== lastSavedKey) {
      return 1;
    }

    const aTime = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    const aEffectiveDate = new Date(a.effective_date || 0).getTime() || 0;
    const bEffectiveDate = new Date(b.effective_date || 0).getTime() || 0;

    return bEffectiveDate - aEffectiveDate;
  });
}

// HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
// Bank Directory has its form and records inside one collapsible card.
// Therefore, after save we keep the card open and scroll to the records section.
function openBankDirectoryCard() {
  setDashboardCardExpanded(
    state.dom.toggleBankDirectoryCardBtn,
    state.dom.bankDirectoryCardCollapse,
    true,
  );
}

// HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
// Redirect to Bank Directory Records after create/update.
// This uses the shared offset-based scroll helper so the heading remains visible.
function redirectToBankDirectoryRecordsAfterSave() {
  openBankDirectoryCard();

  scrollToDashboardTarget(
    state.dom.bankDirectoryRecordsHeader ||
    state.dom.bankDirectoryTableWrapper ||
    state.dom.bankDirectoryCardCollapse,
    16,
  );
}

// HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3 FIX
// Stable key used to identify the bank that was just saved/updated.
function buildBankDirectorySortKey(record = {}) {
  return `${normalizeText(record.bank_name)}|${normalizeText(record.bank_code)}`;
}

// HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3 FIX
// Show the bank just created/updated first.
// Then fall back to updated/created timestamps if available.
// Finally fall back to bank name so the rest of the list remains readable.
function sortBankDirectoryRecordsByLatestActivity(records = []) {
  const lastSavedKey = String(state.lastSavedBankDirectoryKey || "").trim();

  return [...records].sort((a, b) => {
    const aKey = buildBankDirectorySortKey(a);
    const bKey = buildBankDirectorySortKey(b);

    if (lastSavedKey && aKey === lastSavedKey && bKey !== lastSavedKey) {
      return -1;
    }

    if (lastSavedKey && bKey === lastSavedKey && aKey !== lastSavedKey) {
      return 1;
    }

    const aTime = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return String(a.bank_name || "").localeCompare(String(b.bank_name || ""));
  });
}

// HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
// Employee Bank Details has its form and records inside one collapsible card.
// Therefore, after save we keep the card open and scroll to the records section.
function openEmployeeBankDetailsCard() {
  setDashboardCardExpanded(
    state.dom.toggleEmployeeBankDetailsCardBtn,
    state.dom.employeeBankDetailsCardCollapse,
    true,
  );
}

// HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
// Redirect to Employee Bank Records after create/update.
// Uses the shared offset-based scroll helper so the heading remains visible.
function redirectToEmployeeBankDetailsRecordsAfterSave() {
  openEmployeeBankDetailsCard();

  scrollToDashboardTarget(
    state.dom.employeeBankDetailsRecordsHeader ||
    state.dom.employeeBankDetailsTableWrapper ||
    state.dom.employeeBankDetailsCardCollapse,
    16,
  );
}

// HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
// Stable key used to identify the employee bank detail just saved/updated.
function buildEmployeeBankDetailsSortKey(record = {}) {
  const id = String(record.id || "").trim();

  if (id) {
    return `id:${id}`;
  }

  return [
    "fallback",
    normalizeText(record.employee_id),
    normalizeText(record.bank_id),
    normalizeText(record.account_number),
  ].join("|");
}

// HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
// Show the employee bank detail just created/updated first.
// Then fall back to updated/created timestamp.
function sortEmployeeBankDetailsRecordsByLatestActivity(records = []) {
  const lastSavedKey = String(state.lastSavedEmployeeBankDetailsKey || "").trim();

  return [...records].sort((a, b) => {
    const aKey = buildEmployeeBankDetailsSortKey(a);
    const bKey = buildEmployeeBankDetailsSortKey(b);

    if (lastSavedKey && aKey === lastSavedKey && bKey !== lastSavedKey) {
      return -1;
    }

    if (lastSavedKey && bKey === lastSavedKey && aKey !== lastSavedKey) {
      return 1;
    }

    const aTime = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime() || 0;

    return bTime - aTime;
  });
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Create Payroll Record has its own card, while Payroll Records is a separate card.
// After submit/update, we collapse the form card and send HR to the records card.
function openPayrollRecordCard() {
  setDashboardCardExpanded(
    state.dom.togglePayrollRecordCardBtn,
    state.dom.payrollRecordCardCollapse,
    true,
  );
}

function closePayrollRecordCard() {
  setDashboardCardExpanded(
    state.dom.togglePayrollRecordCardBtn,
    state.dom.payrollRecordCardCollapse,
    false,
  );
}

// BATCH PAYROLL DEFAULT - STEP 6A
// Show the normal payroll toolbar when HR is using the individual
// Create Payroll Record form.
function setPayrollRecordToolbarForManualMode() {
  state.dom.payrollFormModeBadge?.classList.remove("d-none");
  state.dom.resetPayrollFormBtn?.classList.remove("d-none");
  state.dom.refreshPayrollRecordsBtn?.classList.remove("d-none");
  state.dom.topSubmitPayrollBtn?.classList.remove("d-none");

  // Cancel Edit is controlled separately by edit mode, so keep it hidden here.
  state.dom.cancelPayrollEditBtn?.classList.add("d-none");
}

// BATCH PAYROLL DEFAULT - STEP 6A
// Hide individual-form controls while HR is reviewing a payroll batch.
// Clear Form and Refresh Payroll belong to the old individual form/records flow,
// so they should not appear beside the Batch Payroll Review table.
function setPayrollRecordToolbarForBatchMode() {
  state.dom.payrollFormModeBadge?.classList.add("d-none");
  state.dom.cancelPayrollEditBtn?.classList.add("d-none");
  state.dom.topSubmitPayrollBtn?.classList.add("d-none");
  state.dom.resetPayrollFormBtn?.classList.add("d-none");
  state.dom.refreshPayrollRecordsBtn?.classList.add("d-none");
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Clear Payroll Records filters so the newly submitted/updated record is visible.
function clearPayrollRecordsFiltersBeforeRedirect() {
  if (state.dom.payrollSearchInput) {
    state.dom.payrollSearchInput.value = "";
  }

  if (state.dom.payrollStatusFilter) {
    state.dom.payrollStatusFilter.value = "";
  }

  if (state.dom.exportPayrollPayCycle) {
    state.dom.exportPayrollPayCycle.value = "";
  }
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Redirect to Payroll Records after submit/update.
function redirectToPayrollRecordsAfterSave() {
  closePayrollRecordCard();

  // BATCH PAYROLL DEFAULT - STEP 7B
  // Land on the full Payroll Records card instead of the inner header.
  // This keeps the rounded card top and breathing space visible,
  // matching the cleaner spacing shown in the preferred layout.
  scrollToDashboardTarget(
    state.dom.payrollRecordsCard ||
      state.dom.payrollRecordsHeader ||
      state.dom.payrollRecordsTableWrapper,
    16,
  );
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Stable key used to identify payroll records just submitted/updated.
function buildPayrollRecordSortKey(record = {}) {
  const id = String(record.id || "").trim();

  if (id) {
    return `id:${id}`;
  }

  return [
    "fallback",
    normalizeText(record.employee_id),
    normalizeText(record.pay_cycle),
    String(record.pay_date || "").trim(),
  ].join("|");
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Show payroll records just submitted/updated first.
// Then fall back to updated/created timestamp and pay date.
function sortPayrollRecordsByLatestActivity(records = []) {
  const lastSavedIds = new Set(
    Array.from(state.lastSavedPayrollRecordIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  return [...records].sort((a, b) => {
    const aId = String(a.id || "").trim();
    const bId = String(b.id || "").trim();

    const aWasJustSaved = lastSavedIds.has(aId);
    const bWasJustSaved = lastSavedIds.has(bId);

    if (aWasJustSaved && !bWasJustSaved) return -1;
    if (bWasJustSaved && !aWasJustSaved) return 1;

    const aTime = new Date(a.updated_at || a.created_at || a.pay_date || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || b.pay_date || 0).getTime() || 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    const aPayDate = new Date(a.pay_date || 0).getTime() || 0;
    const bPayDate = new Date(b.pay_date || 0).getTime() || 0;

    return bPayDate - aPayDate;
  });
}

function bindEvents() {
  state.dom.logoutBtn?.addEventListener("click", async () => {
    await window.SessionManager.logoutUser("logout");
  });

  // BATCH PAYROLL DEFAULT - STEP 6D
  // Back to Top should appear only after scrolling and should return HR
  // to the top of the dashboard without affecting any form data.
  state.dom.backToTopBtn?.addEventListener("click", () => {
    scrollDashboardBackToTop();
  });

    // BATCH PAYROLL DEFAULT - STEP 8A
  // Let HR dismiss the floating notification manually.
  state.dom.dashboardToastCloseBtn?.addEventListener("click", () => {
    hideDashboardToast();
  });

  window.addEventListener("scroll", () => {
    updateBackToTopButtonVisibility();
  });

  updateBackToTopButtonVisibility();

  state.dom.hrTabProfileBtn?.addEventListener("click", () => {
    switchHrWorkspace("profile");
  });

  state.dom.hrTabEmployeesBtn?.addEventListener("click", () => {
    switchHrWorkspace("employees");
  });

  state.dom.hrTabPayrollBtn?.addEventListener("click", () => {
    // BATCH PAYROLL DEFAULT - STEP 6A
    // Manual Payroll tab access should show the normal payroll workspace,
    // not a leftover batch review from the Run Payroll guided flow.
    state.isRunPayrollSelectionMode = false;
    state.selectedEmployeesForPayroll.clear();
    state.batchPayrollPreparedRows = [];

    resetPayrollForm();
    switchHrWorkspace("payroll");
  });

  // RUN PAYROLL - STEP 1
  // Start the payroll run flow from the header by opening the employee list,
  // where HR can select employees for payroll processing.
  state.dom.runPayrollActionBtn?.addEventListener("click", () => {
    startRunPayrollSelectionFlow();
  });

  // RUN PAYROLL - STEP 4
  // Continue from employee selection into the payroll workspace.
  state.dom.continueRunPayrollBtn?.addEventListener("click", () => {
    continueRunPayrollToPayrollWorkspace();
  });

  state.dom.hrProfileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveHrOwnProfile();
  });

  state.dom.hrProfileImageInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;
    handlePendingProfileImage(file);
  });

  state.dom.saveHrProfileImageBtn?.addEventListener("click", async () => {
    await uploadHrProfileImage();
  });

  state.dom.resetEmployeeFormBtn?.addEventListener("click", async () => {
    await handleEmployeeFormClear();
  });

  state.dom.cancelEditBtn?.addEventListener("click", () => {
    exitEmployeeEditMode();
  });

  state.dom.refreshEmployeesBtn?.addEventListener("click", async () => {
    await handleEmployeeRecordsRefresh();
  });

  state.dom.employeeCreateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleEmployeeSave();
  });

  state.dom.employeeSearchInput?.addEventListener("input", () => {
    applyEmployeeSearch();
  });

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1D FIX
  // Keep Create/Update Employee disabled until the required employee form
  // fields are complete and the work email is valid.
  [
    state.dom.firstName,
    state.dom.middleName,
    state.dom.lastName,
    state.dom.workEmail,
    state.dom.phoneNumber,
    state.dom.department,
    state.dom.jobTitle,
    state.dom.lineManager,
    state.dom.employmentDate,
    state.dom.approverEmail,
    state.dom.employmentStatus,
    state.dom.systemRole,
  ].forEach((field) => {
    field?.addEventListener("input", updateEmployeeSaveButtonState);
    field?.addEventListener("change", updateEmployeeSaveButtonState);
  });

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
  // When Department changes, rebuild Job Title so HR can only choose
  // job titles that fit the selected department.
  state.dom.department?.addEventListener("change", () => {
    populateJobTitleOptionsForDepartment("");
  });

  populateJobTitleOptionsForDepartment(state.dom.jobTitle?.value || "");
  updateEmployeeSaveButtonState();

  // DESCRIPTION ITEM 9 - STEP 2
  // Master checkbox control for selecting or clearing all visible employees
  // in the current employee list view.
  state.dom.selectAllEmployeesForPayroll?.addEventListener("change", (event) => {
    toggleAllVisibleEmployeesForPayroll(Boolean(event.target.checked));
  });

  // DESCRIPTION ITEM 1 - STEP 5
  // Bind collapsible behavior for the two HR workspace cards.
  bindCardCollapseToggle(
    state.dom.toggleEmployeeFormCardBtn,
    state.dom.employeeFormCardCollapse,
  );

  bindCardCollapseToggle(
    state.dom.toggleEmployeeListCardBtn,
    state.dom.employeeListCardCollapse,
  );

  state.dom.employeeDocumentsInput?.addEventListener("change", (event) => {
    addPendingFiles(event.target.files);
  });

  state.dom.clearPendingDocumentsBtn?.addEventListener("click", () => {
    clearPendingFiles();
  });

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H FIX
  // Saved documents are rendered dynamically, so use one delegated listener.
  // This keeps Open and Remove working even after the attached document list refreshes.
  state.dom.attachedDocumentsList?.addEventListener("click", async (event) => {
    const openButton = event.target.closest("[data-open-document-id]");
    const removeButton = event.target.closest("[data-remove-document-id]");

    if (openButton) {
      event.preventDefault();
      await openEmployeeDocument(openButton.dataset.openDocumentId);
      return;
    }

    if (removeButton) {
      event.preventDefault();
      await removeEmployeeDocument(removeButton.dataset.removeDocumentId);
    }
  });

  // =========================================================
  // DESCRIPTION ITEM 1
  // Payroll master form bindings
  // Submit now performs create/save for payroll master records.
  // =========================================================
  state.dom.payrollMasterCreateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handlePayrollMasterSave();
  });

  state.dom.resetPayrollMasterFormBtn?.addEventListener("click", async () => {
    await handlePayrollMasterFormClear();
  });

  state.dom.cancelPayrollMasterEditBtn?.addEventListener("click", () => {
    exitPayrollMasterEditMode();
  });

  state.dom.refreshPayrollMasterRecordsBtn?.addEventListener("click", async () => {
    await handlePayrollMasterRecordsRefresh();
  });

  // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 3
  // Bind collapsible behavior for the Payroll Master Data card.
  bindCardCollapseToggle(
    state.dom.togglePayrollMasterCardBtn,
    state.dom.payrollMasterCardCollapse,
  );

  // BANK DIRECTORY - STEP 2
  // Bind collapsible behaviour for the Bank Directory card.
  bindCardCollapseToggle(
    state.dom.toggleBankDirectoryCardBtn,
    state.dom.bankDirectoryCardCollapse,
  );

  // EMPLOYEE BANK DETAILS - STEP 3
  // Bind collapsible behaviour for the Employee Bank Details card.
  // This uses the same reusable collapse helper already used across HR cards.
  bindCardCollapseToggle(
    state.dom.toggleEmployeeBankDetailsCardBtn,
    state.dom.employeeBankDetailsCardCollapse,
  );

  // EMPLOYEE BANK DETAILS - STEP 6
  // Auto-fill the bank code when HR selects a bank from the Bank Directory dropdown,
  // then re-check whether the form is complete enough to enable Save.
  state.dom.employeeBankBankId?.addEventListener("change", () => {
    const selectedOption = state.dom.employeeBankBankId.selectedOptions?.[0];
    const bankCode = selectedOption?.dataset?.bankCode || "";

    if (state.dom.employeeBankCode) {
      state.dom.employeeBankCode.value = bankCode;
    }

    updateEmployeeBankDetailsSaveButtonState();
  });

  // EMPLOYEE BANK DETAILS - STEP 7
  // Save Employee Bank Details into Supabase when the form is submitted.
  state.dom.employeeBankDetailsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleEmployeeBankDetailsSave();
  });

  // EMPLOYEE BANK DETAILS - STEP 5
  // Cancel clears the Employee Bank Details form without touching any saved data.
  state.dom.cancelEmployeeBankDetailsEditBtn?.addEventListener("click", () => {
    resetEmployeeBankDetailsForm();
  });

  // EMPLOYEE BANK DETAILS - STEP 8
  // Filter the Employee Bank Details records as HR types in the search box.
  state.dom.employeeBankDetailsSearchInput?.addEventListener("input", () => {
    applyEmployeeBankDetailsSearch();
  });

  // EMPLOYEE BANK DETAILS - STEP 6
  // Re-check the Save button whenever HR completes or changes required fields.
  [
    state.dom.employeeBankEmployeeId,
    state.dom.employeeBankAccountNumber,
    state.dom.employeeBankAccountName,
    state.dom.employeeBankStatus,
  ].forEach((field) => {
    field?.addEventListener("input", updateEmployeeBankDetailsSaveButtonState);
    field?.addEventListener("change", updateEmployeeBankDetailsSaveButtonState);
  });

  // HR BUTTON UNIFORMITY - STEP 6B
  // Keep Bank Directory, Payroll Master, Allowance Components,
  // and Submit Payroll buttons visually consistent as fields change.
  [
    state.dom.bankName,
    state.dom.bankCode,
    state.dom.bankStatus,
  ].forEach((field) => {
    field?.addEventListener("input", updateBankDirectorySaveButtonState);
    field?.addEventListener("change", updateBankDirectorySaveButtonState);
  });

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade removed from Payroll Master readiness checks.
  // The save button now depends only on the active payroll master fields.
  [
    state.dom.payrollMasterEmployeeId,
    state.dom.payrollMasterBasicSalary,
    state.dom.payrollMasterEffectiveDate,
    state.dom.payrollMasterPayCycle,
    state.dom.payrollMasterStatus,
  ].forEach((field) => {
    field?.addEventListener("input", updatePayrollMasterSaveButtonState);
    field?.addEventListener("change", updatePayrollMasterSaveButtonState);
  });

  [
    state.dom.payrollAllowanceMasterRecordId,
    state.dom.payrollAllowanceType,
    state.dom.payrollAllowanceAmount,
    state.dom.payrollAllowanceEffectiveDate,
    state.dom.payrollAllowanceStatus,
  ].forEach((field) => {
    field?.addEventListener("input", updatePayrollAllowanceSaveButtonState);
    field?.addEventListener("change", updatePayrollAllowanceSaveButtonState);
  });

  [
    state.dom.payrollEmployeeId,
    state.dom.payrollPayCycle,
    state.dom.payrollPayDate,
    state.dom.payrollGrossPay,
    state.dom.payrollTotalDeductions,
    state.dom.payrollNetPay,
  ].forEach((field) => {
    field?.addEventListener("input", updatePayrollSubmitButtonState);
    field?.addEventListener("change", updatePayrollSubmitButtonState);
  });

  // HR BUTTON UNIFORMITY - STEP 6B
  // Set the initial state immediately after the event bindings are attached.
  updateBankDirectorySaveButtonState();
  updateEmployeeBankDetailsSaveButtonState();
  updatePayrollMasterSaveButtonState();
  updatePayrollAllowanceSaveButtonState();
  updatePayrollSubmitButtonState();

  // BANK DIRECTORY - STEP 4
  // Auto-fill bank code when HR selects a bank name.
  state.dom.bankName?.addEventListener("change", () => {
    const selectedOption = state.dom.bankName.selectedOptions?.[0];
    const bankCode = selectedOption?.dataset?.bankCode || "";

    if (state.dom.bankCode) {
      state.dom.bankCode.value = bankCode;
    }

    // BANK DIRECTORY - STEP 8I
    // Enable Save Bank only after a valid bank selection has populated the bank code.
    updateBankDirectorySaveButtonState();
  });

  // BANK DIRECTORY - STEP 7B
  // Prevent page refresh and save Bank Directory record to Supabase.
  state.dom.bankDirectoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleBankDirectorySave();
  });

  // BANK DIRECTORY - STEP 5
  // Filter the local Bank Directory records as HR types.
  state.dom.bankDirectorySearchInput?.addEventListener("input", () => {
    applyBankDirectorySearch();
  });

  // BANK DIRECTORY - STEP 8H
  // Cancel edit and reset form to create mode.
  state.dom.cancelBankDirectoryEditBtn?.addEventListener("click", () => {
    state.currentEditingBankDirectory = null;
    resetBankDirectoryForm();
    setBankDirectoryCreateMode();
  });

  // =========================================================
  // DESCRIPTION ITEM 2
  // Allowance Components bindings
  // Submit now performs create/save for allowance components.
  // =========================================================
  state.dom.payrollAllowanceCreateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handlePayrollAllowanceSave();
  });

  state.dom.resetPayrollAllowanceFormBtn?.addEventListener("click", async () => {
    await handlePayrollAllowanceFormClear();
  });

  state.dom.cancelPayrollAllowanceEditBtn?.addEventListener("click", () => {
    exitPayrollAllowanceEditMode();
  });

  state.dom.refreshPayrollAllowanceRecordsBtn?.addEventListener("click", async () => {
    await handlePayrollAllowanceRecordsRefresh();
  });

  state.dom.payrollAllowanceSearchInput?.addEventListener("input", () => {
    applyPayrollAllowanceSearch();
  });

  // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 4
  // Bind collapsible behavior for the Allowance Components card.
  bindCardCollapseToggle(
    state.dom.togglePayrollAllowanceCardBtn,
    state.dom.payrollAllowanceCardCollapse,
  );

  state.dom.payrollSearchInput?.addEventListener("input", () => {
    applyPayrollSearch();
  });

  state.dom.payrollStatusFilter?.addEventListener("change", () => {
    applyPayrollSearch();
  });

  state.dom.refreshPayrollRecordsBtn?.addEventListener("click", async () => {
    await handlePayrollRecordsRefresh();
  });

  // DESCRIPTION ITEM 4 - STEP 7
  // Close Payslip Preview from either the header close icon or footer button.
  state.dom.closePayslipPreviewBtn?.addEventListener("click", () => {
    closePayslipPreview();
  });

  state.dom.closePayslipPreviewFooterBtn?.addEventListener("click", () => {
    closePayslipPreview();
  });

  // DESCRIPTION ITEM 4 - STEP 7
  // Allow HR to close the preview by clicking the shaded background.
  state.dom.payslipPreviewModal?.addEventListener("click", (event) => {
    if (event.target === state.dom.payslipPreviewModal) {
      closePayslipPreview();
    }
  });

  // PAYROLL EXPORT - DESCRIPTION ITEM 3 - STEP 2
  // Connect the Payroll Records export button to the CSV export handler.
  state.dom.exportPayrollCsvBtn?.addEventListener("click", () => {
    handlePayrollExportCsv();
  });

  // DESCRIPTION ITEM 4 - STEP 4
  // Start the payslip email workflow from Payroll Records.
  // This first creates auditable Pending rows in payslip_email_logs.
  // Actual email delivery will be handled by the secure email function next.
  state.dom.sendPayslipsEmailBtn?.addEventListener("click", async () => {
    await handleSendPayslipsEmailRequest();
  });

  // DESCRIPTION ITEM 4 - STEP 6
  // When HR changes the payroll action cycle, keep Payroll Records and
  // Payslip Email Status aligned to the same selected cycle.
  state.dom.exportPayrollPayCycle?.addEventListener("change", async () => {
    applyPayrollSearch();
    updateSendPayslipsButtonState();
    await refreshPayslipEmailLogs();
  });

  // DESCRIPTION ITEM 4 - STEP 5B
  // Make Payslip Email Status collapsible so audit details do not permanently
  // lengthen the Payroll Records card.
  bindCardCollapseToggle(
    state.dom.togglePayslipEmailLogsBtn,
    state.dom.payslipEmailLogsCollapse,
  );

  // DESCRIPTION ITEM 4 - STEP 6
  // Refresh the Payslip Email Status panel from Supabase.
  // This reads audit rows only; it does not send any email.
  state.dom.refreshPayslipEmailLogsBtn?.addEventListener("click", async () => {
    await refreshPayslipEmailLogs({ showAlert: true });
  });

  state.dom.payrollCreateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handlePayrollSave();
  });

  // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 3
  // Submit the existing payroll form from the top toolbar shortcut.
  state.dom.topSubmitPayrollBtn?.addEventListener("click", () => {
    state.dom.payrollCreateForm?.requestSubmit();
  });

  // DESCRIPTION ITEM 2 - STEP 1
  // Whenever payroll selects an employee, refresh the read-only HR reference panel.
  state.dom.payrollEmployeeId?.addEventListener("change", () => {
    renderPayrollSelectedEmployeeReference();

    // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 4
    // Also populate payroll values when HR manually chooses one employee.
    populatePayrollFormFromEmployeeMaster(state.dom.payrollEmployeeId?.value || "");
  });

  state.dom.resetPayrollFormBtn?.addEventListener("click", async () => {
    await handlePayrollFormClear();
  });

  state.dom.cancelPayrollEditBtn?.addEventListener("click", () => {
    exitPayrollEditMode();
  });

  // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 5
  // Bind collapsible behavior for the Create Payroll Record card.
  bindCardCollapseToggle(
    state.dom.togglePayrollRecordCardBtn,
    state.dom.payrollRecordCardCollapse,
  );

  // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 5
  // When HR selects a pay cycle, default the pay date to that month end.
  state.dom.payrollPayCycle?.addEventListener("change", () => {
    updatePayDateFromPayCycle();
  });

    // BATCH PAYROLL DEFAULT - STEP 7
  // Submit prepared batch payroll records from the review table.
  state.dom.submitBatchPayrollBtn?.addEventListener("click", async () => {
    await handleBatchPayrollSubmit();
  });

  // BATCH PAYROLL DEFAULT - STEP 6B
  // Keep the batch pay date aligned with the selected batch pay period.
  state.dom.batchPayrollPayCycle?.addEventListener("change", () => {
    updateBatchPayDateFromPayCycle();
  });

  state.dom.payrollEmployeeGroup?.addEventListener("change", () => {
    updatePayrollModelUi("group");
  });

  state.dom.payrollModel?.addEventListener("change", () => {
    updatePayrollModelUi("model");
  });

  bindPayrollAutoCalculationEvents();
}

function setWorkspaceRefreshLoading(button, isLoading, loadingText = "Refreshing...") {
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${loadingText}
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

// =========================================================
// UI POLISH
// Keeps fast-loading buttons from clearing too quickly,
// so the spinner is actually visible to the user.
// =========================================================
function waitForMinimumLoadingFeedback(startedAt, minimumMs = 300) {
  const elapsed = Date.now() - startedAt;

  if (elapsed >= minimumMs) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, minimumMs - elapsed);
  });
}

// HR BUTTON UNIFORMITY - STEP 6B
// One shared helper for form action buttons.
// Incomplete form = grey and disabled.
// Complete form = blue and enabled.
// This keeps Bank Directory, Employee Bank Details, Payroll Master,
// Allowance Components, and Submit Payroll visually consistent.
function setPrimaryActionButtonReadyState(button, canSubmit) {
  if (!button) return;

  button.disabled = !canSubmit;

  button.classList.toggle("btn-primary", canSubmit);
  button.classList.toggle("btn-secondary", !canSubmit);
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1D FIX
// Employee form follows the same button behaviour as the other HR/payroll forms.
// Incomplete form = grey and disabled.
// Complete form = blue and enabled.
// This check is non-invasive and does not show red validation while HR is typing.
function isEmployeeFormReadyForSubmit() {
  const requiredFields = [
    state.dom.firstName,
    state.dom.lastName,
    state.dom.workEmail,
    state.dom.department,
    state.dom.jobTitle,
    state.dom.employmentDate,
  ];

  const hasRequiredValues = requiredFields.every((field) =>
    Boolean(String(field?.value || "").trim()),
  );

  const workEmail = String(state.dom.workEmail?.value || "").trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasValidWorkEmail = emailPattern.test(workEmail);

  return hasRequiredValues && hasValidWorkEmail;
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1D FIX
// Updates the Create/Update Employee button without submitting the form.
function updateEmployeeSaveButtonState() {
  setPrimaryActionButtonReadyState(
    state.dom.saveEmployeeBtn,
    isEmployeeFormReadyForSubmit(),
  );
}

async function handleEmployeeRecordsRefresh() {
  const button = state.dom.refreshEmployeesBtn;

  try {
    setWorkspaceRefreshLoading(button, true);
    await waitForNextPaint();
    await refreshEmployeeWorkspace();
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

// =========================================================
// DESCRIPTION ITEM 1
// Payroll Master workspace helpers
// These make the new toolbar and search responsive before
// save/load persistence is added.
// =========================================================
async function handlePayrollMasterRecordsRefresh() {
  const button = state.dom.refreshPayrollMasterRecordsBtn;

  try {
    setWorkspaceRefreshLoading(button, true, "Refreshing...");
    await waitForNextPaint();
    await refreshPayrollMasterWorkspace();
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

async function handlePayrollMasterFormClear() {
  const button = state.dom.resetPayrollMasterFormBtn;
  const startedAt = Date.now();

  try {
    setWorkspaceRefreshLoading(button, true, "Clearing...");
    await waitForNextPaint();
    resetPayrollMasterForm();

    // Keep the spinner visible briefly so the user sees feedback.
    await waitForMinimumLoadingFeedback(startedAt);
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

async function refreshPayrollMasterWorkspace() {
  renderPayrollMasterRecordsLoadingState();

  // Rebuild employee dropdown from the employee list already loaded for HR.
  populatePayrollMasterEmployeeOptions();

  // Load payroll master records from the database, then apply client-side search.
  await loadPayrollMasterRecords();
}
// =========================================================
// DESCRIPTION ITEM 1
// Payroll Master create/save helpers
// This step supports create only. Edit/update comes next.
// =========================================================
function validatePayrollMasterForm() {
  let isValid = true;
  let firstInvalidField = null;

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade is no longer required for Payroll Master Data.
  const requiredFields = [
    state.dom.payrollMasterEmployeeId,
    state.dom.payrollMasterBasicSalary,
    state.dom.payrollMasterEffectiveDate,
    state.dom.payrollMasterPayCycle,
    state.dom.payrollMasterStatus,
  ];

  requiredFields.forEach((field) => {
    const value = String(field?.value || "").trim();

    if (!value) {
      field?.classList.add("is-invalid");
      isValid = false;
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field?.classList.remove("is-invalid");
    }
  });

  const salaryValue = Number(state.dom.payrollMasterBasicSalary?.value || 0);
  if (!Number.isFinite(salaryValue) || salaryValue < 0) {
    state.dom.payrollMasterBasicSalary?.classList.add("is-invalid");
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.payrollMasterBasicSalary;
  }

  if (!isValid && firstInvalidField?.focus) {
    firstInvalidField.focus();
  }

  return isValid;
}

function buildPayrollMasterPayload(isEditMode = false) {
  const payload = {
    employee_id: String(state.dom.payrollMasterEmployeeId?.value || "").trim(),

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
    // Grade removed from active Payroll Master save payload.
    // Existing database grade values are left untouched for historical records.
    basic_salary: Number(state.dom.payrollMasterBasicSalary?.value || 0),
    salary_effective_date: state.dom.payrollMasterEffectiveDate?.value || null,
    pay_cycle: String(state.dom.payrollMasterPayCycle?.value || "").trim(),
    payroll_status: String(state.dom.payrollMasterStatus?.value || "Active").trim(),
    notes: String(state.dom.payrollMasterNotes?.value || "").trim() || null,

    // Always update the modifier on save.
    updated_by: state.currentUser?.id || null,
  };

  // Only stamp created_by when creating a new record.
  if (!isEditMode) {
    payload.created_by = state.currentUser?.id || null;
  }

  return payload;
}

function setPayrollMasterSaveLoading(isLoading, isEditMode = false) {
  const button = state.dom.savePayrollMasterBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${isEditMode ? "Updating Master Data..." : "Saving Master Data..."}
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.savePayrollMasterBtnText = document.getElementById("savePayrollMasterBtnText");
  }
}

async function handlePayrollMasterSave() {
  clearPageAlert();

  if (!validatePayrollMasterForm()) {
    showPageAlert(
      "warning",
      "Please complete all required payroll master fields before saving.",
    );
    return;
  }

  const editingId = String(state.dom.editingPayrollMasterId?.value || "").trim();
  const isEditMode = Boolean(editingId);
  const payload = buildPayrollMasterPayload(isEditMode);

  try {
    setPayrollMasterSaveLoading(true, isEditMode);

    const supabase = getSupabaseClient();
    let response;

    // =========================================================
    // DESCRIPTION ITEM 1
    // Create new master record or update existing one,
    // depending on whether we are in edit mode.
    // =========================================================
    if (isEditMode) {
      response = await supabase
        .from("payroll_master_records")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle();
    } else {
      response = await supabase
        .from("payroll_master_records")
        .insert([payload])
        .select("*")
        .maybeSingle();
    }

    if (response.error) {
      throw response.error;
    }

    await refreshPayrollMasterWorkspace();

    showPageAlert(
      "success",
      isEditMode
        ? `Payroll master record was updated successfully for effective date <strong>${escapeHtml(
          payload.salary_effective_date,
        )}</strong>.`
        : `Payroll master record was created successfully for effective date <strong>${escapeHtml(
          payload.salary_effective_date,
        )}</strong>.`,
    );

    // HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
    // After create/update, clear the form and redirect to Payroll Master Records.
    // The card stays open because the form and records share the same card.
    resetPayrollMasterForm();

    setTimeout(() => {
      redirectToPayrollMasterRecordsAfterSave();
    }, 250);
  } catch (error) {
    console.error("Error saving payroll master record:", error);

    // Surface unique index conflicts in business-friendly language.
    if (
      String(error.message || "").toLowerCase().includes("uq_payroll_master_employee_effective_date") ||
      String(error.message || "").toLowerCase().includes("duplicate key value")
    ) {
      showPageAlert(
        "warning",
        "A payroll master record already exists for this employee on the selected salary effective date.",
      );
      return;
    }

    showPageAlert(
      "danger",
      error.message || "Payroll master record could not be saved.",
    );
  } finally {
    setPayrollMasterSaveLoading(false, isEditMode);
  }
}
function resetPayrollMasterForm() {
  if (!state.dom.payrollMasterCreateForm) return;

  state.dom.payrollMasterCreateForm.reset();
  state.currentEditingPayrollMaster = null;

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade removed from Payroll Master reset handling.
  const fieldsToReset = [
    state.dom.payrollMasterEmployeeId,
    state.dom.payrollMasterBasicSalary,
    state.dom.payrollMasterEffectiveDate,
    state.dom.payrollMasterPayCycle,
    state.dom.payrollMasterStatus,
  ];

  fieldsToReset.forEach((field) => {
    field?.classList.remove("is-invalid");
  });

  if (state.dom.editingPayrollMasterId) {
    state.dom.editingPayrollMasterId.value = "";
  }

  if (state.dom.payrollMasterStatus) {
    state.dom.payrollMasterStatus.value = "Active";
  }

  if (state.dom.payrollMasterFormModeBadge) {
    state.dom.payrollMasterFormModeBadge.textContent = "Create Mode";
    state.dom.payrollMasterFormModeBadge.className =
      "badge rounded-pill text-bg-light border px-3 py-2";
  }

  if (state.dom.cancelPayrollMasterEditBtn) {
    state.dom.cancelPayrollMasterEditBtn.classList.add("d-none");
  }

  if (state.dom.savePayrollMasterBtn) {
    state.dom.savePayrollMasterBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="savePayrollMasterBtnText">Create Payroll Master Record</span>
    `;
    state.dom.savePayrollMasterBtnText = document.getElementById("savePayrollMasterBtnText");
  }

  // HR BUTTON UNIFORMITY - STEP 6B
  // Return Payroll Master action button to grey/disabled after clear or save.
  updatePayrollMasterSaveButtonState();

}

function exitPayrollMasterEditMode() {
  resetPayrollMasterForm();
}

function renderPayrollMasterRecordsLoadingState() {
  if (!state.dom.payrollMasterRecordsTableBody) return;

  if (state.dom.payrollMasterRecordsEmptyState) {
    state.dom.payrollMasterRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.payrollMasterRecordsTableWrapper) {
    state.dom.payrollMasterRecordsTableWrapper.classList.remove("d-none");
  }

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade column removed, so Payroll Master table now has 7 columns.
  state.dom.payrollMasterRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-secondary py-4">
        Loading payroll master records.
      </td>
    </tr>
  `;
}

function renderPayrollMasterRecords(records) {
  const tbody = state.dom.payrollMasterRecordsTableBody;
  if (!tbody) return;

  // =========================================================
  // DESCRIPTION ITEM 2
  // Keep the Allowance Components parent dropdown in sync
  // with the latest loaded payroll master records.
  // =========================================================
  populatePayrollAllowanceMasterOptions();

  tbody.innerHTML = "";

  if (!records.length) {
    if (state.dom.payrollMasterRecordsEmptyState) {
      state.dom.payrollMasterRecordsEmptyState.classList.remove("d-none");
    }

    if (state.dom.payrollMasterRecordsTableWrapper) {
      state.dom.payrollMasterRecordsTableWrapper.classList.add("d-none");
    }

    return;
  }

  if (state.dom.payrollMasterRecordsEmptyState) {
    state.dom.payrollMasterRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.payrollMasterRecordsTableWrapper) {
    state.dom.payrollMasterRecordsTableWrapper.classList.remove("d-none");
  }

  // HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
  // Render newest/most recently updated master records first.
  const recordsToRender = sortPayrollMasterRecordsByLatestActivity(records);

  recordsToRender.forEach((record) => {
    const fullName =
      `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
      record.work_email ||
      "Unknown Employee";

    const row = document.createElement("tr");
    row.innerHTML = `
  <td>
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 6
         Keep the employee identity compact and readable in one primary cell. -->
    <div class="fw-semibold">${escapeHtml(fullName)}</div>
    <div class="text-secondary small text-break">
      ${escapeHtml(record.work_email || "--")}
    </div>
  </td>

  <td class="text-nowrap">
    <!-- EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
         Grade removed from Payroll Master Records table.
         Salary now follows employee identity directly. -->
    ${formatCurrency(record.basic_salary, "NGN")}
  </td>

  <td class="text-nowrap">${formatDate(record.salary_effective_date)}</td>

  <td>${escapeHtml(record.pay_cycle || "--")}</td>

  <td>
    <span class="badge ${getStatusBadgeClass(record.payroll_status)}">
      ${escapeHtml(formatStatusLabel(record.payroll_status))}
    </span>
  </td>

  <td class="text-nowrap">
  <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 6A
       Use date only in the payroll master list so the Updated column
       stays cleaner and does not crowd the row. -->
  ${formatDate(record.updated_at || record.created_at)}
</td>

  <td class="text-center">
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 6
         Use a compact icon-only edit action to reduce table clutter. -->
    <button
      type="button"
      class="btn btn-sm btn-outline-primary"
      title="Edit payroll master record"
      aria-label="Edit payroll master record"
      onclick="window.hrEditPayrollMasterRecord('${String(record.id).replaceAll("'", "\\'")}')"
    >
      <i class="bi bi-pencil-square"></i>
    </button>
  </td>
`;

    tbody.appendChild(row);
  });
}

// =========================================================
// DESCRIPTION ITEM 1
// Enter payroll master edit mode from the records table.
// Save/update behavior will be added in the next step.
// =========================================================
function startPayrollMasterEdit(payrollMasterId) {
  const record = state.payrollMasterRecords.find(
    (item) => String(item.id) === String(payrollMasterId),
  );

  if (!record) {
    showPageAlert(
      "warning",
      "The selected payroll master record could not be found. Please refresh and try again.",
    );
    return;
  }

  state.currentEditingPayrollMaster = record;

  if (state.dom.editingPayrollMasterId) {
    state.dom.editingPayrollMasterId.value = record.id || "";
  }

  if (state.dom.payrollMasterEmployeeId) {
    state.dom.payrollMasterEmployeeId.value = record.employee_id || "";
  }

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade removed from Payroll Master edit mode.
  // Existing saved grade values are ignored by the active UI.

  if (state.dom.payrollMasterBasicSalary) {
    state.dom.payrollMasterBasicSalary.value = record.basic_salary ?? "";
  }

  if (state.dom.payrollMasterEffectiveDate) {
    state.dom.payrollMasterEffectiveDate.value = record.salary_effective_date || "";
  }

  if (state.dom.payrollMasterPayCycle) {
    state.dom.payrollMasterPayCycle.value = record.pay_cycle || "";
  }

  if (state.dom.payrollMasterStatus) {
    state.dom.payrollMasterStatus.value = record.payroll_status || "Active";
  }

  if (state.dom.payrollMasterNotes) {
    state.dom.payrollMasterNotes.value = record.notes || "";
  }

  if (state.dom.payrollMasterFormModeBadge) {
    state.dom.payrollMasterFormModeBadge.textContent = "Edit Mode";
    state.dom.payrollMasterFormModeBadge.className =
      "badge rounded-pill text-bg-primary px-3 py-2";
  }

  if (state.dom.cancelPayrollMasterEditBtn) {
    state.dom.cancelPayrollMasterEditBtn.classList.remove("d-none");
  }

  if (state.dom.savePayrollMasterBtn) {
    state.dom.savePayrollMasterBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="savePayrollMasterBtnText">Update Payroll Master Record</span>
    `;
    state.dom.savePayrollMasterBtnText = document.getElementById("savePayrollMasterBtnText");
  }

  // HR SAVE/EDIT BEHAVIOUR - PAYROLL MASTER STEP 1
  // Editing must reopen Payroll Master Data even if HR collapsed it.
  openPayrollMasterCard();

  scrollToDashboardTarget(
    state.dom.payrollMasterCreateForm?.closest(".dashboard-section-card") ||
    state.dom.payrollMasterCreateForm ||
    state.dom.payrollMasterCardCollapse,
    16,
  );
}
// =========================================================
// DESCRIPTION ITEM 2
// Populate Payroll Master Record options for the Allowance
// Components form using the master records already loaded
// for Description Item 1.
// =========================================================
function populatePayrollAllowanceMasterOptions() {
  const select = state.dom.payrollAllowanceMasterRecordId;
  if (!select) return;

  const currentValue = select.value;
  const records = Array.isArray(state.payrollMasterRecords)
    ? [...state.payrollMasterRecords]
    : [];

  // Always reset the dropdown first.
  select.innerHTML = `<option value="">Select payroll master record</option>`;

  if (!records.length) {
    select.innerHTML = `<option value="">Create payroll master record first</option>`;
    return;
  }

  // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
  // Render newest/most recently updated allowance records first.
  const recordsToRender = sortPayrollAllowanceRecordsByLatestActivity(records);

  recordsToRender.forEach((record) => {
    const option = document.createElement("option");
    const fullName =
      `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
      record.work_email ||
      "Unknown Employee";

    option.value = record.id;
    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
    // Grade removed from Payroll Master dropdown labels.
    option.textContent = `${fullName} — ${formatCurrency(record.basic_salary, "NGN")} — ${record.salary_effective_date || "--"}`;
    select.appendChild(option);
  });

  // Keep the current selected value if it still exists.
  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );
    if (stillExists) {
      select.value = currentValue;
    }
  }

  // DESCRIPTION ITEM 2 - STEP 1
  // Keep the payroll employee reference panel synced after rebuilding options.
  renderPayrollSelectedEmployeeReference(select.value);
}
function applyPayrollMasterSearch() {
  const searchTerm = normalizeText(state.dom.payrollMasterSearchInput?.value || "");

  let rows = [...state.payrollMasterRecords];

  if (searchTerm) {
    rows = rows.filter((record) => {
      // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
      // Grade removed from Payroll Master search.
      const searchableText = [
        record.first_name,
        record.last_name,
        record.work_email,
        record.pay_cycle,
        record.payroll_status,
        record.salary_effective_date,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  state.filteredPayrollMasterRecords = rows;
  renderPayrollMasterRecords(rows);
}
// =========================================================
// DESCRIPTION ITEM 2
// Allowance Components workspace helpers
// These make the new toolbar and search responsive before
// save/load persistence is added.
// =========================================================
async function handlePayrollAllowanceRecordsRefresh() {
  const button = state.dom.refreshPayrollAllowanceRecordsBtn;
  const startedAt = Date.now();

  try {
    setWorkspaceRefreshLoading(button, true, "Refreshing...");
    await waitForNextPaint();
    await refreshPayrollAllowanceWorkspace();

    // Keep spinner visible briefly for user feedback.
    await waitForMinimumLoadingFeedback(startedAt);
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

async function handlePayrollAllowanceFormClear() {
  const button = state.dom.resetPayrollAllowanceFormBtn;
  const startedAt = Date.now();

  try {
    setWorkspaceRefreshLoading(button, true, "Clearing...");
    await waitForNextPaint();
    resetPayrollAllowanceForm();

    // Keep spinner visible briefly for user feedback.
    await waitForMinimumLoadingFeedback(startedAt);
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

async function refreshPayrollAllowanceWorkspace() {
  renderPayrollAllowanceRecordsLoadingState();

  // Keep the parent payroll master dropdown in sync.
  populatePayrollAllowanceMasterOptions();

  // Load allowance rows from the database, then apply search.
  await loadPayrollAllowanceComponents();
}
// =========================================================
// DESCRIPTION ITEM 2
// Allowance create/save helpers
// This step supports create only. Edit/update comes next.
// =========================================================
function validatePayrollAllowanceForm() {
  let isValid = true;
  let firstInvalidField = null;

  const requiredFields = [
    state.dom.payrollAllowanceMasterRecordId,
    state.dom.payrollAllowanceType,
    state.dom.payrollAllowanceAmount,
    state.dom.payrollAllowanceEffectiveDate,
    state.dom.payrollAllowanceStatus,
  ];

  requiredFields.forEach((field) => {
    const value = String(field?.value || "").trim();

    if (!value) {
      field?.classList.add("is-invalid");
      isValid = false;
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field?.classList.remove("is-invalid");
    }
  });

  const amountValue = Number(state.dom.payrollAllowanceAmount?.value || 0);
  if (!Number.isFinite(amountValue) || amountValue < 0) {
    state.dom.payrollAllowanceAmount?.classList.add("is-invalid");
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.payrollAllowanceAmount;
  }

  if (!isValid && firstInvalidField?.focus) {
    firstInvalidField.focus();
  }

  return isValid;
}

function buildPayrollAllowancePayload(isEditMode = false) {
  const payload = {
    payroll_master_record_id: String(
      state.dom.payrollAllowanceMasterRecordId?.value || "",
    ).trim(),
    allowance_type: String(state.dom.payrollAllowanceType?.value || "").trim(),
    allowance_amount: Number(state.dom.payrollAllowanceAmount?.value || 0),
    effective_date: state.dom.payrollAllowanceEffectiveDate?.value || null,
    allowance_status: String(
      state.dom.payrollAllowanceStatus?.value || "Active",
    ).trim(),
    notes: String(state.dom.payrollAllowanceNotes?.value || "").trim() || null,

    // Always stamp the updater.
    updated_by: state.currentUser?.id || null,
  };

  // Only set created_by when creating a new record.
  if (!isEditMode) {
    payload.created_by = state.currentUser?.id || null;
  }

  return payload;
}

function setPayrollAllowanceSaveLoading(isLoading, isEditMode = false) {
  const button = state.dom.savePayrollAllowanceBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${isEditMode ? "Updating Allowance..." : "Saving Allowance..."}
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.savePayrollAllowanceBtnText = document.getElementById("savePayrollAllowanceBtnText");
  }
}

async function handlePayrollAllowanceSave() {
  clearPageAlert();

  if (!validatePayrollAllowanceForm()) {
    showPageAlert(
      "warning",
      "Please complete all required allowance fields before saving.",
    );
    return;
  }

  const editingId = String(state.dom.editingPayrollAllowanceId?.value || "").trim();
  const isEditMode = Boolean(editingId);
  const payload = buildPayrollAllowancePayload(isEditMode);

  try {
    setPayrollAllowanceSaveLoading(true, isEditMode);

    const supabase = getSupabaseClient();
    let response;

    if (isEditMode) {
      response = await supabase
        .from("payroll_allowance_components")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle();
    } else {
      response = await supabase
        .from("payroll_allowance_components")
        .insert([payload])
        .select("*")
        .maybeSingle();
    }

    if (response.error) {
      throw response.error;
    }

    // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2 FIX
    // Remember the saved/updated allowance so it appears first after refresh,
    // even if another allowance has a later effective date.
    state.lastSavedPayrollAllowanceKey = buildPayrollAllowanceSortKey({
      id: response.data?.id || editingId,
      payroll_master_record_id:
        response.data?.payroll_master_record_id ||
        payload.payroll_master_record_id,
      allowance_type: response.data?.allowance_type || payload.allowance_type,
      effective_date: response.data?.effective_date || payload.effective_date,
    });

    // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
    // Clear search before refresh so the newly saved/updated record is visible
    // at the top of Allowance Records.
    if (state.dom.payrollAllowanceSearchInput) {
      state.dom.payrollAllowanceSearchInput.value = "";
    }

    await refreshPayrollAllowanceWorkspace();

    showPageAlert(
      "success",
      isEditMode
        ? `Allowance component was updated successfully for effective date <strong>${escapeHtml(
          payload.effective_date,
        )}</strong>.`
        : `Allowance component was created successfully for effective date <strong>${escapeHtml(
          payload.effective_date,
        )}</strong>.`,
    );

    // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
    // After create/update, clear the form and redirect to Allowance Records.
    // The card stays open because the form and records share the same card.
    resetPayrollAllowanceForm();

    setTimeout(() => {
      redirectToPayrollAllowanceRecordsAfterSave();
    }, 250);
  } catch (error) {
    console.error("Error saving allowance component:", error);

    if (
      String(error.message || "").toLowerCase().includes("uq_payroll_allowance_master_type_effective_date") ||
      String(error.message || "").toLowerCase().includes("duplicate key value")
    ) {
      showPageAlert(
        "warning",
        "An allowance component already exists for this payroll master record, allowance type, and effective date.",
      );
      return;
    }

    showPageAlert(
      "danger",
      error.message || "Allowance component could not be saved.",
    );
  } finally {
    setPayrollAllowanceSaveLoading(false, isEditMode);
  }
}
function resetPayrollAllowanceForm() {
  if (!state.dom.payrollAllowanceCreateForm) return;

  state.dom.payrollAllowanceCreateForm.reset();
  state.currentEditingPayrollAllowance = null;

  // Clear validation styling when returning to create mode.
  const fieldsToReset = [
    state.dom.payrollAllowanceMasterRecordId,
    state.dom.payrollAllowanceType,
    state.dom.payrollAllowanceAmount,
    state.dom.payrollAllowanceEffectiveDate,
    state.dom.payrollAllowanceStatus,
  ];

  fieldsToReset.forEach((field) => {
    field?.classList.remove("is-invalid");
  });

  if (state.dom.editingPayrollAllowanceId) {
    state.dom.editingPayrollAllowanceId.value = "";
  }

  if (state.dom.payrollAllowanceStatus) {
    state.dom.payrollAllowanceStatus.value = "Active";
  }

  if (state.dom.payrollAllowanceFormModeBadge) {
    state.dom.payrollAllowanceFormModeBadge.textContent = "Create Mode";
    state.dom.payrollAllowanceFormModeBadge.className =
      "badge rounded-pill text-bg-light border px-3 py-2";
  }

  if (state.dom.cancelPayrollAllowanceEditBtn) {
    state.dom.cancelPayrollAllowanceEditBtn.classList.add("d-none");
  }

  if (state.dom.savePayrollAllowanceBtn) {
    state.dom.savePayrollAllowanceBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="savePayrollAllowanceBtnText">Create Allowance Component</span>
    `;
    state.dom.savePayrollAllowanceBtnText = document.getElementById("savePayrollAllowanceBtnText");
  }

  // HR BUTTON UNIFORMITY - STEP 6B
  // Return Allowance action button to grey/disabled after clear or save.
  updatePayrollAllowanceSaveButtonState();
}

function exitPayrollAllowanceEditMode() {
  resetPayrollAllowanceForm();
}

function renderPayrollAllowanceRecordsLoadingState() {
  if (!state.dom.payrollAllowanceRecordsTableBody) return;

  if (state.dom.payrollAllowanceRecordsEmptyState) {
    state.dom.payrollAllowanceRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.payrollAllowanceRecordsTableWrapper) {
    state.dom.payrollAllowanceRecordsTableWrapper.classList.remove("d-none");
  }

  state.dom.payrollAllowanceRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-secondary py-4">
        Loading allowance records.
      </td>
    </tr>
  `;
}

function renderPayrollAllowanceRecords(records) {
  const tbody = state.dom.payrollAllowanceRecordsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    if (state.dom.payrollAllowanceRecordsEmptyState) {
      state.dom.payrollAllowanceRecordsEmptyState.classList.remove("d-none");
    }

    if (state.dom.payrollAllowanceRecordsTableWrapper) {
      state.dom.payrollAllowanceRecordsTableWrapper.classList.add("d-none");
    }

    return;
  }

  if (state.dom.payrollAllowanceRecordsEmptyState) {
    state.dom.payrollAllowanceRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.payrollAllowanceRecordsTableWrapper) {
    state.dom.payrollAllowanceRecordsTableWrapper.classList.remove("d-none");
  }

  // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2 FIX
  // Apply the saved/updated-first sorting before rendering the table.
  // Without this, the sort helper exists but the table still renders in
  // Supabase/effective-date order.
  const recordsToRender = sortPayrollAllowanceRecordsByLatestActivity(records);

  recordsToRender.forEach((record) => {
    const fullName =
      `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
      record.work_email ||
      "Unknown Employee";

    const masterLabel = `${fullName} — ${record.payroll_master_grade || "--"} — ${record.payroll_master_effective_date || "--"}`;

    const row = document.createElement("tr");
    row.innerHTML = `
  <td>
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 7
         Keep the payroll master reference compact and readable in one primary cell. -->
    <div class="fw-semibold">${escapeHtml(masterLabel)}</div>
    <div class="text-secondary small text-break">
      ${escapeHtml(record.work_email || "--")}
    </div>
  </td>

  <td>${escapeHtml(record.allowance_type || "--")}</td>

  <td class="text-nowrap">
    ${formatCurrency(record.allowance_amount, "NGN")}
  </td>

  <td class="text-nowrap">${formatDate(record.effective_date)}</td>

  <td>
    <span class="badge ${getStatusBadgeClass(record.allowance_status)}">
      ${escapeHtml(formatStatusLabel(record.allowance_status))}
    </span>
  </td>

  <td class="text-nowrap">
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 7
         Keep updated date compact in the allowance records table. -->
    ${formatDate(record.updated_at || record.created_at)}
  </td>

  <td class="text-center">
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 7
         Use a compact icon-only edit action to reduce table clutter. -->
    <button
      type="button"
      class="btn btn-sm btn-outline-primary"
      title="Edit allowance component"
      aria-label="Edit allowance component"
      onclick="window.hrEditPayrollAllowanceRecord('${String(record.id).replaceAll("'", "\\'")}')"
    >
      <i class="bi bi-pencil-square"></i>
    </button>
  </td>
`;

    tbody.appendChild(row);
  });
}
// =========================================================
// DESCRIPTION ITEM 2
// Load allowance components from Supabase for the new
// allowance maintenance section.
// =========================================================
async function loadPayrollAllowanceComponents() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("payroll_allowance_components")
      .select(`
        *,
        payroll_master_records (
          id,
          grade,
          salary_effective_date,
          employees (
            id,
            first_name,
            last_name,
            work_email
          )
        )
      `)
      .order("effective_date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const rows = Array.isArray(data)
      ? data.map((record) => {
        const masterRecord = record.payroll_master_records || {};
        const employee = masterRecord.employees || {};

        return {
          ...record,
          payroll_master_grade: masterRecord.grade || "",
          payroll_master_effective_date: masterRecord.salary_effective_date || "",
          first_name: employee.first_name || "",
          last_name: employee.last_name || "",
          work_email: employee.work_email || "",
        };
      })
      : [];

    state.payrollAllowanceComponents = rows;
    applyPayrollAllowanceSearch();
  } catch (error) {
    console.error("Error loading allowance components:", error);
    showPageAlert(
      "danger",
      error.message || "Allowance components could not be loaded.",
    );

    state.payrollAllowanceComponents = [];
    state.filteredPayrollAllowanceComponents = [];
    renderPayrollAllowanceRecords([]);
  }
}

// =========================================================
// DESCRIPTION ITEM 2
// Enter allowance edit mode from the records table.
// Save/update behavior will be added in the next step.
// =========================================================
function startPayrollAllowanceEdit(allowanceId) {
  const record = state.payrollAllowanceComponents.find(
    (item) => String(item.id) === String(allowanceId),
  );

  if (!record) {
    showPageAlert(
      "warning",
      "The selected allowance component could not be found. Please refresh and try again.",
    );
    return;
  }

  state.currentEditingPayrollAllowance = record;

  if (state.dom.editingPayrollAllowanceId) {
    state.dom.editingPayrollAllowanceId.value = record.id || "";
  }

  if (state.dom.payrollAllowanceMasterRecordId) {
    state.dom.payrollAllowanceMasterRecordId.value = record.payroll_master_record_id || "";
  }

  if (state.dom.payrollAllowanceType) {
    state.dom.payrollAllowanceType.value = record.allowance_type || "";
  }

  if (state.dom.payrollAllowanceAmount) {
    state.dom.payrollAllowanceAmount.value = record.allowance_amount ?? "";
  }

  if (state.dom.payrollAllowanceEffectiveDate) {
    state.dom.payrollAllowanceEffectiveDate.value = record.effective_date || "";
  }

  if (state.dom.payrollAllowanceStatus) {
    state.dom.payrollAllowanceStatus.value = record.allowance_status || "Active";
  }

  if (state.dom.payrollAllowanceNotes) {
    state.dom.payrollAllowanceNotes.value = record.notes || "";
  }

  if (state.dom.payrollAllowanceFormModeBadge) {
    state.dom.payrollAllowanceFormModeBadge.textContent = "Edit Mode";
    state.dom.payrollAllowanceFormModeBadge.className =
      "badge rounded-pill text-bg-primary px-3 py-2";
  }

  if (state.dom.cancelPayrollAllowanceEditBtn) {
    state.dom.cancelPayrollAllowanceEditBtn.classList.remove("d-none");
  }

  if (state.dom.savePayrollAllowanceBtn) {
    state.dom.savePayrollAllowanceBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="savePayrollAllowanceBtnText">Update Allowance Component</span>
    `;
    state.dom.savePayrollAllowanceBtnText = document.getElementById("savePayrollAllowanceBtnText");
  }

  // HR SAVE/EDIT BEHAVIOUR - ALLOWANCE COMPONENTS STEP 2
  // Editing must reopen Allowance Components even if HR collapsed it.
  openPayrollAllowanceCard();

  scrollToDashboardTarget(
    state.dom.payrollAllowanceCreateForm?.closest(".dashboard-section-card") ||
    state.dom.payrollAllowanceCreateForm ||
    state.dom.payrollAllowanceCardCollapse,
    16,
  );
}
function applyPayrollAllowanceSearch() {
  const searchTerm = normalizeText(state.dom.payrollAllowanceSearchInput?.value || "");

  let rows = [...state.payrollAllowanceComponents];

  if (searchTerm) {
    rows = rows.filter((record) => {
      const searchableText = [
        record.allowance_type,
        record.allowance_status,
        record.effective_date,
        record.notes,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  state.filteredPayrollAllowanceComponents = rows;
  renderPayrollAllowanceRecords(rows);
}
async function handlePayrollRecordsRefresh() {
  const button = state.dom.refreshPayrollRecordsBtn;

  try {
    setWorkspaceRefreshLoading(button, true);
    await waitForNextPaint();
    await refreshPayrollWorkspace();
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

// BANK DIRECTORY - STEP 10A
// Save selected bank into Supabase and show a spinner while processing.
// If the selected bank already exists, refresh and focus the table on the
// existing matching row so HR can immediately see it.
async function handleBankDirectorySave() {
  const bankName = String(state.dom.bankName?.value || "").trim();
  const bankCode = String(state.dom.bankCode?.value || "").trim();
  const status = String(state.dom.bankStatus?.value || "Active").trim();

  if (!bankName || !bankCode) {
    showPageAlert("warning", "Please select a bank to save.");
    return;
  }

  const editingId = String(state.currentEditingBankDirectory?.id || "").trim();
  const isEditMode = Boolean(editingId);

  try {
    setBankDirectorySaveLoading(
      true,
      isEditMode ? "Updating Bank..." : "Checking Bank...",
    );

    // BANK DIRECTORY - STEP 10B
    // Check duplicate bank name and duplicate bank code separately.
    // This lets us correct a saved bank-code drift when the same bank name
    // already exists but its stored code no longer matches the controlled dropdown.
    const sameNameBank = state.bankDirectoryRecords.find(
      (bank) =>
        String(bank.id) !== editingId &&
        normalizeText(bank.bank_name) === normalizeText(bankName),
    );

    const sameCodeBank = state.bankDirectoryRecords.find(
      (bank) =>
        String(bank.id) !== editingId &&
        normalizeText(bank.bank_code) === normalizeText(bankCode),
    );

    // BANK DIRECTORY - STEP 10B
    // If the bank name already exists but the saved code is different,
    // correct the existing Supabase row instead of leaving the mismatch visible.
    if (!isEditMode && sameNameBank) {
      const existingBankCode = String(sameNameBank.bank_code || "").trim();

      if (existingBankCode !== bankCode) {
        const supabase = getSupabaseClient();

        const { error } = await supabase
          .from("bank_directory")
          .update({
            bank_code: bankCode,
            status,
            updated_by: state.currentUser?.id || null,
          })
          .eq("id", sameNameBank.id);

        if (error) throw error;

        // BANK DIRECTORY - STEP 10C
        // Clear the search after automatic correction so the redirected records area
        // still shows the full Bank Directory list.
        if (state.dom.bankDirectorySearchInput) {
          state.dom.bankDirectorySearchInput.value = "";
        }

        // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3 FIX
        // Remember the corrected bank so it appears first after refresh.
        state.lastSavedBankDirectoryKey = buildBankDirectorySortKey({
          bank_name: bankName,
          bank_code: bankCode,
        });

        resetBankDirectoryForm();
        await refreshBankDirectoryWorkspace();
        applyBankDirectorySearch();

        // BANK DIRECTORY - STEP 10B
        // Keep Employee Bank Details bank dropdown aligned with the corrected
        // Bank Directory value.
        await refreshEmployeeBankDetailsWorkspace();

        showPageAlert(
          "success",
          `${escapeHtml(bankName)} already existed. Its saved bank code was corrected from <strong>${escapeHtml(
            existingBankCode || "--",
          )}</strong> to <strong>${escapeHtml(bankCode)}</strong>.`,
        );

        scrollToBankDirectoryRecords();
        return;
      }
    }

    const duplicateBank = sameNameBank || sameCodeBank;

    if (duplicateBank) {
      await refreshBankDirectoryWorkspace();

      if (state.dom.bankDirectorySearchInput) {
        state.dom.bankDirectorySearchInput.value =
          duplicateBank.bank_name || duplicateBank.bank_code || bankName;
      }

      applyBankDirectorySearch();

      showPageAlert(
        "warning",
        `${escapeHtml(duplicateBank.bank_name || bankName)} already exists in the Bank Directory.`,
      );

      scrollToBankDirectoryRecords();
      return;
    }

    setBankDirectorySaveLoading(
      true,
      isEditMode ? "Updating Bank..." : "Saving Bank...",
    );

    const supabase = getSupabaseClient();

    const payload = {
      bank_name: bankName,
      bank_code: bankCode,
      status,
      updated_by: state.currentUser?.id || null,
    };

    const response = isEditMode
      ? await supabase
        .from("bank_directory")
        .update(payload)
        .eq("id", editingId)
      : await supabase.from("bank_directory").insert([
        {
          ...payload,
          created_by: state.currentUser?.id || null,
        },
      ]);

    if (response.error) throw response.error;

    showPageAlert(
      "success",
      isEditMode
        ? `${escapeHtml(bankName)} was updated successfully.`
        : `${escapeHtml(bankName)} was added to Bank Directory.`,
    );

    // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3 FIX
    // Remember the saved/updated bank so it appears first after refresh.
    state.lastSavedBankDirectoryKey = buildBankDirectorySortKey({
      bank_name: bankName,
      bank_code: bankCode,
    });

    resetBankDirectoryForm();

    // BANK DIRECTORY - STEP 10C
    // After a successful save/update, clear the search filter so HR lands
    // on Bank Directory Records and sees the full approved bank list.
    if (state.dom.bankDirectorySearchInput) {
      state.dom.bankDirectorySearchInput.value = "";
    }

    await refreshBankDirectoryWorkspace();
    applyBankDirectorySearch();

    // BANK DIRECTORY - STEP 10C
    // Keep Employee Bank Details bank dropdown/table aligned after Bank Directory changes.
    await refreshEmployeeBankDetailsWorkspace();

    scrollToBankDirectoryRecords();
  } catch (error) {
    console.error("Error saving bank directory record:", error);
    showPageAlert(
      "danger",
      error.message || "Bank Directory record could not be saved.",
    );
  } finally {
    setBankDirectorySaveLoading(false);
  }
}
// Reset form after save
function resetBankDirectoryForm() {
  if (state.dom.bankDirectoryForm) {
    state.dom.bankDirectoryForm.reset();
  }

  if (state.dom.bankCode) {
    state.dom.bankCode.value = "";
  }

  state.currentEditingBankDirectory = null;

  setBankDirectoryCreateMode();
}
if (state.dom.bankDirectoryForm) {
  state.dom.bankDirectoryForm.reset();
}

if (state.dom.bankCode) {
  state.dom.bankCode.value = "";
}

// BANK DIRECTORY - STEP 8I
// Keep Save Bank disabled until the form has a selected bank and code.
// HR BUTTON UNIFORMITY - STEP 6B
// Bank Directory follows the same disabled/active button pattern
// as the rest of the HR payroll setup forms.
function updateBankDirectorySaveButtonState() {
  const hasBankName = Boolean(String(state.dom.bankName?.value || "").trim());
  const hasBankCode = Boolean(String(state.dom.bankCode?.value || "").trim());

  setPrimaryActionButtonReadyState(
    state.dom.saveBankDirectoryBtn,
    hasBankName && hasBankCode,
  );
}

// BANK DIRECTORY - STEP 10A
// Shows visible feedback while Save Bank is checking/saving/updating.
// This keeps Bank Directory consistent with the other HR save buttons.
function setBankDirectorySaveLoading(isLoading, loadingText = "Saving Bank...") {
  const button = state.dom.saveBankDirectoryBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${loadingText}
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }

  // BANK DIRECTORY - STEP 10A
  // Recalculate enabled/disabled styling after the spinner is removed.
  updateBankDirectorySaveButtonState();
}

// HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
// Keep this existing function name because Bank Directory save logic already
// calls it from save, duplicate, and bank-code correction paths.
// Internally, it now uses the shared clean card/header redirect behaviour.
function scrollToBankDirectoryRecords() {
  setTimeout(() => {
    redirectToBankDirectoryRecordsAfterSave();
  }, 150);
}

// BANK DIRECTORY - STEP 8H
// Switch UI to Create mode
// BANK DIRECTORY - STEP 6C
// Switch UI to Create mode while keeping Cancel visible.
// Cancel now behaves as a clear/reset action in create mode,
// matching Employee Bank Details.
function setBankDirectoryCreateMode() {
  if (state.dom.bankDirectorySubmitLabel) {
    state.dom.bankDirectorySubmitLabel.textContent = "Save Bank";
  }

  state.dom.cancelBankDirectoryEditBtn?.classList.remove("d-none");

  if (state.dom.bankName) state.dom.bankName.disabled = false;
  if (state.dom.bankCode) state.dom.bankCode.disabled = false;

  updateBankDirectorySaveButtonState();
}

// Switch UI to Edit mode
function setBankDirectoryEditMode() {
  if (state.dom.bankDirectorySubmitLabel) {
    state.dom.bankDirectorySubmitLabel.textContent = "Update Bank";
  }

  state.dom.cancelBankDirectoryEditBtn?.classList.remove("d-none");

  // Lock fields during edit
  if (state.dom.bankName) state.dom.bankName.disabled = true;
  if (state.dom.bankCode) state.dom.bankCode.disabled = true;
}

// BANK DIRECTORY - STEP 8F
// Activate edit mode so Save Bank updates instead of creating duplicate.
function startBankDirectoryEdit(bankId) {
  const record = state.bankDirectoryRecords.find(
    (bank) => String(bank.id) === String(bankId),
  );

  if (!record) {
    showPageAlert(
      "warning",
      "The selected bank record could not be found. Please refresh and try again.",
    );
    return;
  }

  // 🔴 CRITICAL: set edit mode
  state.currentEditingBankDirectory = record;
  setBankDirectoryEditMode();

  if (state.dom.bankName) {
    state.dom.bankName.value = record.bank_name || "";
  }

  if (state.dom.bankCode) {
    state.dom.bankCode.value = record.bank_code || "";
  }

  if (state.dom.bankStatus) {
    state.dom.bankStatus.value = record.status || "Active";
  }

  // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
  // Editing must reopen Bank Directory even if HR collapsed it.
  openBankDirectoryCard();

  scrollToDashboardTarget(
    state.dom.bankDirectoryForm?.closest(".dashboard-section-card") ||
    state.dom.bankDirectoryForm ||
    state.dom.bankDirectoryCardCollapse,
    16,
  );

  showPageAlert("info", "Editing bank. Update status and click Save Bank.");
}

// Apply search filter
function applyBankDirectorySearch() {
  const query = String(state.dom.bankDirectorySearchInput?.value || "")
    .toLowerCase()
    .trim();

  state.filteredBankDirectoryRecords = state.bankDirectoryRecords.filter(
    (bank) =>
      bank.bank_name.toLowerCase().includes(query) ||
      bank.bank_code.toLowerCase().includes(query),
  );

  renderBankDirectoryTable();
}

// BANK DIRECTORY - STEP 7A
// Load saved bank directory records from Supabase.
async function refreshBankDirectoryWorkspace() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("bank_directory")
      .select("*")
      .order("bank_name", { ascending: true });

    if (error) throw error;

    state.bankDirectoryRecords = Array.isArray(data) ? data : [];

    // EMPLOYEE BANK DETAILS - STEP 4
    // Keep the Employee Bank Details bank dropdown in sync with the
    // saved Bank Directory records from Supabase.
    populateEmployeeBankBankOptions();

    applyBankDirectorySearch();
  } catch (error) {
    console.error("Error loading bank directory:", error);
    showPageAlert(
      "danger",
      error.message || "Bank Directory records could not be loaded.",
    );

    state.bankDirectoryRecords = [];
    state.filteredBankDirectoryRecords = [];
    renderBankDirectoryTable();
  }
}

// Render table
function renderBankDirectoryTable() {
  const records = state.filteredBankDirectoryRecords || [];
  const tbody = state.dom.bankDirectoryTableBody;

  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    state.dom.bankDirectoryEmptyState?.classList.remove("d-none");
    state.dom.bankDirectoryTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.bankDirectoryEmptyState?.classList.add("d-none");
  state.dom.bankDirectoryTableWrapper?.classList.remove("d-none");

  // HR SAVE/EDIT BEHAVIOUR - BANK DIRECTORY STEP 3
  // Render newest/most recently updated banks first.
  const recordsToRender = sortBankDirectoryRecordsByLatestActivity(records);

  recordsToRender.forEach((bank) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(bank.bank_name)}</td>
      <td>${escapeHtml(bank.bank_code)}</td>
      <td>
        <span class="badge ${bank.status === "Active" ? "bg-success" : "bg-secondary"
      }">
          ${bank.status}
        </span>
      </td>
<td class="text-center">
  <!-- BANK DIRECTORY - STEP 8A
       Keep Bank Directory actions visually consistent with Employee,
       Payroll Master, Allowance, and Payroll Records tables. -->
  <button
    type="button"
    class="btn btn-sm btn-outline-primary"
    title="Edit bank directory record"
    aria-label="Edit bank directory record"
    onclick="window.hrEditBankDirectoryRecord('${String(bank.id).replaceAll("'", "\\'")}')"
  >
    <i class="bi bi-pencil-square"></i>
  </button>
</td>
    `;

    tbody.appendChild(row);
  });
}

// PAYROLL CSV EXPORT FIX - STEP 2
// Export CSV must work separately from Send Payslips.
// Export CSV downloads a bank-ready spreadsheet.
// Send Payslips only prepares payslip email audit records.
function handlePayrollExportCsv() {
  // PAYROLL CSV EXPORT FIX - STEP 3
  // Keep this helper inside Export CSV so the button does not depend on
  // any outside/global helper name. This only affects CSV export.
  function getExportBankDetailsForPayrollRecord(record) {
    const employeeId = String(record?.employee_id || "").trim();
    const employeeEmail = normalizeText(record?.work_email || "");

    const activeBankDetails = (state.employeeBankDetailsRecords || []).filter(
      (bankDetail) => normalizeText(bankDetail.status) === "active",
    );

    let matchedBankDetail = null;

    if (employeeId) {
      matchedBankDetail = activeBankDetails.find(
        (bankDetail) =>
          String(bankDetail.employee_id || "").trim() === employeeId,
      );
    }

    if (!matchedBankDetail && employeeEmail) {
      matchedBankDetail = activeBankDetails.find(
        (bankDetail) =>
          normalizeText(bankDetail.employee_email || "") === employeeEmail,
      );
    }

    return matchedBankDetail || null;
  }
  const selectedPayCycle = String(
    state.dom.exportPayrollPayCycle?.value || "",
  ).trim();

  // PAYROLL CSV EXPORT FIX - STEP 2
  // CSV export uses finalised Payroll Records only.
  // It does not use Payslip Email Status logs.
  const records = (state.payrollRecords || []).filter((record) => {
    const isFinalised = Boolean(record.is_finalised);
    const recordPayCycle = String(record.pay_cycle || "").trim();

    if (!isFinalised) return false;
    if (!selectedPayCycle) return true;

    return recordPayCycle === selectedPayCycle;
  });

  if (!records.length) {
    showPageAlert(
      "warning",
      selectedPayCycle
        ? `No finalised payroll records are available for <strong>${escapeHtml(
          selectedPayCycle,
        )}</strong>. CSV export only works from finalised Payroll Records, not Payslip Email Status logs.`
        : "No finalised payroll records are available for export. CSV export only works from finalised Payroll Records, not Payslip Email Status logs.",
    );

    state.dom.pageAlert?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    return;
  }

  // PAYROLL CSV EXPORT FIX - STEP 2
  // Block export if any finalised payroll record is missing active bank details.
  // This prevents blank Account Number, Bank Code, or Bank Name in the CSV.
  const recordsMissingBankDetails = records.filter(
    (record) => !getExportBankDetailsForPayrollRecord(record),
  );

  if (recordsMissingBankDetails.length) {
    const missingEmployeeNames = recordsMissingBankDetails
      .slice(0, 5)
      .map((record) => {
        const employeeName = `${record.first_name || ""} ${record.last_name || ""}`.trim();

        return (
          employeeName ||
          record.work_email ||
          record.employee_number ||
          "Unknown Employee"
        );
      });

    const extraCount =
      recordsMissingBankDetails.length - missingEmployeeNames.length;

    showPageAlert(
      "warning",
      `CSV export stopped because ${recordsMissingBankDetails.length} finalised payroll record(s) ${selectedPayCycle
        ? `for <strong>${escapeHtml(selectedPayCycle)}</strong> `
        : ""
      }do not have active employee bank details. Missing: <strong>${escapeHtml(
        missingEmployeeNames.join(", "),
      )}${extraCount > 0 ? `, and ${extraCount} more` : ""}</strong>.`,
    );

    state.dom.pageAlert?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    return;
  }

  // PAYROLL CSV EXPORT FIX - STEP 2
  // Bank-ready spreadsheet columns.
  // Bank Code and Bank Name are included here.
  const headers = [
    "Account Name",
    "Account Number",
    "Bank Code",
    "Bank Name",
    "Amount",
    "Currency",
    "Payment Reference",
    "Employee Email",
    "Pay Cycle",
  ];

  const rows = records.map((record) => {
    const employeeName =
      `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
      record.work_email ||
      "Unknown Employee";

    const bankDetails = getExportBankDetailsForPayrollRecord(record);

    return [
      bankDetails?.account_name || employeeName,
      bankDetails?.account_number || "",
      bankDetails?.bank_code || "",
      bankDetails?.bank_name || "",
      Number(record.net_pay || 0).toFixed(2),
      record.currency || "NGN",
      `${record.pay_cycle || "Payroll"} - ${employeeName}`,
      record.work_email || "",
      record.pay_cycle || "",
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const safeCycle = selectedPayCycle
    ? selectedPayCycle.replace(/\s+/g, "_").toLowerCase()
    : "all_cycles";

  link.href = url;
  link.download = `payroll_bank_export_${safeCycle}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);

  showPageAlert(
    "success",
    `${records.length} finalised payroll record(s) exported successfully with Bank Code and Bank Name included.`,
  );
}
async function handleEmployeeFormClear() {
  const button = state.dom.resetEmployeeFormBtn;
  const startedAt = Date.now();

  try {
    setWorkspaceRefreshLoading(button, true, "Clearing...");
    await waitForNextPaint();
    exitEmployeeEditMode();

    // Keep the spinner visible briefly so the user sees feedback.
    await waitForMinimumLoadingFeedback(startedAt);
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

async function handlePayrollFormClear() {
  const button = state.dom.resetPayrollFormBtn;
  const startedAt = Date.now();

  try {
    setWorkspaceRefreshLoading(button, true, "Clearing...");
    await waitForNextPaint();
    exitPayrollEditMode();

    // Keep the spinner visible briefly so the user sees feedback.
    await waitForMinimumLoadingFeedback(startedAt);
  } finally {
    setWorkspaceRefreshLoading(button, false);
  }
}

// BATCH PAYROLL DEFAULT - STEP 2
// Moves selected employees into a batch payroll review table.
// This replaces the old behaviour where a single selected employee was pushed
// into the individual payroll dropdown/form by default.
function continueRunPayrollToPayrollWorkspace() {
  const selectedEmployeeIds = Array.from(state.selectedEmployeesForPayroll || [])
    .map((employeeId) => String(employeeId || "").trim())
    .filter(Boolean);

  if (!selectedEmployeeIds.length) {
    showPageAlert(
      "warning",
      "Please select at least one employee before continuing to payroll.",
    );
    return;
  }

  switchHrWorkspace("payroll");

  // BATCH PAYROLL DEFAULT - STEP 2
  // Keep the user in batch payroll mode once they continue from the
  // Run Payroll employee selection table.
  state.isRunPayrollSelectionMode = true;

  // BATCH PAYROLL DEFAULT - STEP 2
  // The individual employee dropdown must not be the default Run Payroll
  // experience anymore. Clear it and hide the manual form for this batch flow.
  if (state.dom.payrollEmployeeId) {
    state.dom.payrollEmployeeId.value = "";
  }

  renderPayrollSelectedEmployeeReference("");

  if (state.dom.payrollCreateForm) {
    state.dom.payrollCreateForm.classList.add("d-none");
  }

  // BATCH PAYROLL DEFAULT - STEP 6A
  // Batch Payroll is not an editable individual form, so hide the old
  // Create Mode, Clear Form, Refresh Payroll, and top Submit Payroll controls.
  setPayrollRecordToolbarForBatchMode();

  if (state.dom.payrollBankReadinessSubmitWarning) {
    state.dom.payrollBankReadinessSubmitWarning.classList.add("d-none");
  }

  if (state.dom.payrollFormTitle) {
    state.dom.payrollFormTitle.textContent = "Create Payroll Batch";
  }

  if (state.dom.payrollFormSubtext) {
    state.dom.payrollFormSubtext.textContent =
      "Review selected active employees in a batch table before payroll calculation and submission.";
  }

  // BATCH PAYROLL DEFAULT - STEP 6B
  // Prepare the batch pay period controls before showing the review table.
  populateBatchPayrollPayCycleOptions();

  renderBatchPayrollReviewTable(selectedEmployeeIds);

  // BATCH PAYROLL DEFAULT - STEP 2
  // Open the payroll card and land directly on the batch review table.
  openPayrollRecordCard();

  // BATCH PAYROLL DEFAULT - STEP 2B
  // Wait for the Payroll workspace to become visible before scrolling.
  // The previous scroll fired too early and targeted the inner batch table,
  // which made the Create Payroll Batch heading look cut off.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      scrollToDashboardTarget(
        state.dom.payrollFormTitle?.closest(".mb-4") ||
        state.dom.payrollFormTitle ||
        state.dom.payrollRecordCardCollapse?.closest(".dashboard-section-card") ||
        state.dom.payrollRecordCardCollapse,
        56,
      );
    });
  });
}

// BATCH PAYROLL DEFAULT - STEP 3B
// Renders selected active employees into a compact batch payroll review table.
// Staff No. is grouped under Employee, and Pay Cycle is grouped under Base Salary
// so the table is easier to read and does not feel cramped.
function renderBatchPayrollReviewTable(selectedEmployeeIds = []) {
  const tbody = state.dom.batchPayrollReviewTableBody;
  const countBadge = state.dom.batchPayrollReviewCount;

  if (!tbody) return;

  const selectedIdSet = new Set(
    selectedEmployeeIds
      .map((employeeId) => String(employeeId || "").trim())
      .filter(Boolean),
  );

  const selectedEmployees = (state.employees || []).filter((employee) => {
    const employeeId = String(employee.id || "").trim();
    const isSelected = selectedIdSet.has(employeeId);
    const isActive = normalizeText(employee.status) === "active";

    return isSelected && isActive;
  });

  if (countBadge) {
    countBadge.textContent =
      selectedEmployees.length === 1
        ? "1 selected"
        : `${selectedEmployees.length} selected`;
  }

  tbody.innerHTML = "";
  // BATCH PAYROLL DEFAULT - STEP 5
  // Rebuild prepared payroll rows every time the review table is rendered.
  // This prevents old selected employees/calculations from carrying forward.
  state.batchPayrollPreparedRows = [];
  // BATCH PAYROLL DEFAULT - STEP 4
  // Show a blocking setup warning before batch submission is introduced.
  // The table can still display the selected employees, but the warning makes
  // it clear that missing/inactive Payroll Master setup must be fixed first.
  renderBatchPayrollSetupWarning(selectedEmployees);

  if (!selectedEmployees.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-secondary py-4">
          No active selected employees are available for batch payroll.
        </td>
      </tr>
    `;

    state.dom.batchPayrollReviewPanel?.classList.remove("d-none");
    return;
  }

  selectedEmployees.forEach((employee) => {
    const fullName =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.work_email ||
      "Unknown Employee";

    // BATCH PAYROLL DEFAULT - STEP 3B
    // Each selected employee must show their own active Payroll Master record.
    // This is still review-only; save/submission will come later.
    const activePayrollMaster =
      getLatestActivePayrollMasterProfileForEmployee(employee.id);

    const salaryValue = Number(activePayrollMaster?.basic_salary || 0);
    const hasValidActiveMaster =
      Boolean(activePayrollMaster) &&
      Number.isFinite(salaryValue) &&
      salaryValue > 0;

    // BATCH PAYROLL DEFAULT - STEP 5
    // Prepare this employee's calculated payroll row from their own
    // active Payroll Master salary. Nothing is saved yet.
    const preparedPayrollRow = hasValidActiveMaster
      ? buildBatchPayrollPreparedRow(employee, activePayrollMaster)
      : null;

    if (preparedPayrollRow) {
      state.batchPayrollPreparedRows.push(preparedPayrollRow);
    }

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(fullName)}</div>

        <div class="text-secondary small text-break">
          ${escapeHtml(employee.work_email || "--")}
        </div>

        <div class="text-secondary small">
          Staff No: ${escapeHtml(employee.employee_number || "--")}
        </div>

        <!-- BATCH PAYROLL DEFAULT - STEP 11
             Let HR remove this employee from the current batch without
             returning to the employee list. -->
        <button type="button"
          class="btn btn-sm btn-outline-danger mt-2"
          onclick="window.hrRemoveEmployeeFromPayrollBatch('${String(employee.id || "").replaceAll("'", "\\'")}')">
          <i class="bi bi-x-circle me-1"></i>Remove
        </button>
      </td>

      <td>${escapeHtml(employee.department || "--")}</td>

      <td>${escapeHtml(employee.job_title || "--")}</td>

      <td>
        <span class="badge ${getStatusBadgeClass(employee.status)}">
          ${escapeHtml(formatStatusLabel(employee.status))}
        </span>
      </td>

      <td class="text-nowrap">
        <div>
          ${hasValidActiveMaster
        ? formatCurrency(activePayrollMaster.basic_salary, "NGN")
        : "--"
      }
        </div>

        <div class="text-secondary small">
          Cycle: ${escapeHtml(activePayrollMaster?.pay_cycle || "--")}
        </div>

        ${preparedPayrollRow
        ? `<div class="text-secondary small mt-1">
                Est. Gross: ${formatCurrency(preparedPayrollRow.gross_pay, "NGN")}
              </div>
              <div class="text-secondary small">
                Est. PAYE: ${formatCurrency(preparedPayrollRow.paye_tax, "NGN")}
              </div>
              <div class="text-secondary small">
                Est. Net: ${formatCurrency(preparedPayrollRow.net_pay, "NGN")}
              </div>`
        : ""
      }
      </td>

      <td>
        ${hasValidActiveMaster
        ? `<span class="badge text-bg-success">Ready</span>`
        : `<span class="badge text-bg-warning">Missing active setup</span>`
      }

        ${activePayrollMaster?.salary_effective_date
        ? `<div class="text-secondary small mt-1 text-nowrap">
                Effective ${formatDate(activePayrollMaster.salary_effective_date)}
              </div>`
        : ""
      }
      </td>
    `;

    tbody.appendChild(row);
  });

  state.dom.batchPayrollReviewPanel?.classList.remove("d-none");

  // BATCH PAYROLL DEFAULT - STEP 7
  // Refresh the submit button state after the ready/missing payroll rows
  // have been recalculated for the current selected employees.
  updateSubmitBatchPayrollButtonState();
}

// RUN PAYROLL - STEP 1
// Opens the Full Employee List as the payroll selection workspace.
// This keeps employee selection tied to the HR employee source and avoids
// creating a separate payroll-only employee list.
function startRunPayrollSelectionFlow() {
  // BATCH PAYROLL DEFAULT - STEP 1
  // Run Payroll now starts in batch selection mode.
  // This keeps the user on the employee table first instead of pushing them
  // straight into the individual payroll dropdown/form.
  state.isRunPayrollSelectionMode = true;

  // BATCH PAYROLL DEFAULT - STEP 1
  // Start each payroll run with a clean selection so old checkmarks
  // from a previous run do not accidentally carry into a new batch.
  state.selectedEmployeesForPayroll.clear();

  // BATCH PAYROLL DEFAULT - STEP 1
  // Clear employee search so all active employees are visible when the
  // payroll batch selection table opens.
  if (state.dom.employeeSearchInput) {
    state.dom.employeeSearchInput.value = "";
  }

  switchHrWorkspace("employees");

  if (state.dom.employeeListCardCollapse) {
    state.dom.employeeListCardCollapse.classList.remove("d-none");
  }

  if (state.dom.toggleEmployeeListCardBtn) {
    state.dom.toggleEmployeeListCardBtn.setAttribute("aria-expanded", "true");

    const icon = state.dom.toggleEmployeeListCardBtn.querySelector("i");
    const label = state.dom.toggleEmployeeListCardBtn.querySelector("span");

    if (icon) icon.className = "bi bi-chevron-up me-2";
    if (label) label.textContent = "Collapse";
  }

  // BATCH PAYROLL DEFAULT - STEP 1
  // Re-render the employee table after enabling Run Payroll mode.
  // applyEmployeeSearch now limits this table to active employees only.
  applyEmployeeSearch();

  // RUN PAYROLL - STEP 2
  // Show a clear mode notice so HR understands this is now payroll selection.
  state.dom.runPayrollSelectionNotice?.classList.remove("d-none");

  syncSelectAllEmployeesForPayrollCheckbox();

  // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - SCROLL FIX
  // Scroll to the selection notice instead of the table so the Run Payroll
  // header/context remains visible and does not look cut off.
  state.dom.runPayrollSelectionNotice?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function switchHrWorkspace(workspace) {
  const isProfile = workspace === "profile";
  const isEmployees = workspace === "employees";
  const isPayroll = workspace === "payroll";

  state.dom.hrProfileSection?.classList.toggle("d-none", !isProfile);
  state.dom.hrEmployeesSection?.classList.toggle("d-none", !isEmployees);
  state.dom.hrPayrollSection?.classList.toggle("d-none", !isPayroll);

  if (state.dom.hrTabProfileBtn) {
    state.dom.hrTabProfileBtn.className = isProfile
      ? "btn btn-primary dashboard-action-btn text-nowrap"
      : "btn btn-outline-primary dashboard-action-btn text-nowrap";
  }

  if (state.dom.hrTabEmployeesBtn) {
    state.dom.hrTabEmployeesBtn.className = isEmployees
      ? "btn btn-primary dashboard-action-btn text-nowrap"
      : "btn btn-outline-primary dashboard-action-btn text-nowrap";
  }

  if (state.dom.hrTabPayrollBtn) {
    state.dom.hrTabPayrollBtn.className = isPayroll
      ? "btn btn-primary dashboard-action-btn text-nowrap"
      : "btn btn-outline-primary dashboard-action-btn text-nowrap";
  }

  if (state.dom.hrModuleValue) {
    state.dom.hrModuleValue.textContent = isProfile
      ? "Profile"
      : isEmployees
        ? "Employee Management"
        : "Payroll Management";
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// PAYROLL RECORDS DATE CLARITY - STEP 12B
// Compact audit timestamp for Payroll Records.
// Keeps the table narrow while still showing the submitted date and time.
function formatCompactDateTime(value) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);

  const compactDate = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const compactTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${compactDate}, ${compactTime}`;
}

function formatBytes(bytes) {
  const numericBytes = Number(bytes || 0);
  if (!numericBytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = numericBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatCurrency(value, currency = "NGN") {
  const numericValue = Number(value || 0);
  const resolvedCurrency = String(currency || "NGN").toUpperCase();

  if (resolvedCurrency === "NGN") {
    return `NGN ${numericValue.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: resolvedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch (error) {
    return `${resolvedCurrency} ${numericValue.toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

function getInitials(fullName, fallback = "HR") {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return fallback;
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function formatStatusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return "--";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusBadgeClass(status) {
  const normalized = normalizeText(status);
  if (normalized === "active") return "text-bg-success";
  if (normalized === "inactive") return "text-bg-secondary";
  return "text-bg-warning";
}

function getPayrollStatusBadgeClass(status) {
  const normalized = normalizeText(status);
  if (normalized === "authorised") return "text-bg-success";
  if (normalized === "draft") return "text-bg-secondary";
  if (normalized === "pending") return "text-bg-warning";
  return "text-bg-light border text-dark";
}

function setSelectValueIfPresent(field, preferredValue, fallbacks = []) {
  if (!field) return;

  const values = [preferredValue, ...fallbacks]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const options = Array.from(field.options || []).map((option) => option.value);

  const matchedValue = values.find((value) =>
    options.some(
      (optionValue) =>
        String(optionValue).trim().toLowerCase() === value.toLowerCase(),
    ),
  );

  if (!matchedValue) return;

  const actualOption = options.find(
    (optionValue) =>
      String(optionValue).trim().toLowerCase() === matchedValue.toLowerCase(),
  );

  field.value = actualOption;
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
// Department-specific job title list.
// Every department currently available in the employee form has at least
// one matching job title, so HR is not left with an empty Job Title dropdown.
const EMPLOYEE_DEPARTMENT_JOB_TITLES = Object.freeze({
  Accounting: [
    "Accountant",
    "Accounts Assistant",
    "Finance Officer",
    "Payroll Officer",
  ],

  Administration: [
    "Administrative Officer",
    "Office Administrator",
    "Executive Assistant",
    "Receptionist",
  ],

  Compliance: [
    "Compliance Officer",
    "Compliance Analyst",
    "Risk Officer",
    "Internal Control Officer",
  ],

  "Customer Support": [
    "Customer Support Officer",
    "Customer Service Representative",
    "Customer Success Officer",
    "Helpdesk Officer",
  ],

  Facilities: [
    "Facilities Officer",
    "Facilities Manager",
    "Health and Safety Officer",
    "Office Maintenance Officer",
  ],

  Finance: [
    "Finance Officer",
    "Finance Analyst",
    "Accountant",
    "Payroll Officer",
    "Finance Manager",
  ],

  "Human Resources": [
    "HR Officer",
    "HR Assistant",
    "HR Manager",
    "Payroll Officer",
    "Recruitment Officer",
  ],

  "Information Technology": [
    "IT Support Officer",
    "Application Analyst",
    "Business Analyst",
    "Data Analyst",
    "Systems Administrator",
    "Software Developer",
  ],

  Legal: [
    "Legal Officer",
    "Legal Assistant",
    "Compliance Officer",
    "Contract Officer",
  ],

  Maintenance: [
    "Maintenance Officer",
    "Junior Engineer",
    "Engineer",
    "Technician",
    "Maintenance Supervisor",
  ],

  Marketing: [
    "Marketing Officer",
    "Digital Marketing Officer",
    "Communications Officer",
    "Campaign Officer",
  ],

  Media: [
    "Cinematographer",
    "Producer",
    "Content Creator",
    "Video Editor",
    "Media Officer",
  ],

  Operations: [
    "Operations Officer",
    "Operations Manager",
    "Supervisor",
    "Logistics Officer",
  ],

  Procurement: [
    "Procurement Officer",
    "Procurement Assistant",
    "Vendor Management Officer",
    "Stores Officer",
  ],

  Sales: [
    "Sales Officer",
    "Sales Executive",
    "Account Manager",
    "Business Development Officer",
  ],
});

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
// Rebuild Job Title options based on the selected Department.
// This keeps Department and Job Title aligned while still preserving
// an existing saved job title during edit mode if it is not in the new list.
function populateJobTitleOptionsForDepartment(preferredJobTitle = "") {
  const department = String(state.dom.department?.value || "").trim();
  const jobTitleSelect = state.dom.jobTitle;

  if (!jobTitleSelect) return;

  const savedOrCurrentJobTitle = String(
    preferredJobTitle || jobTitleSelect.value || "",
  ).trim();

  const jobTitles = EMPLOYEE_DEPARTMENT_JOB_TITLES[department] || [];

  jobTitleSelect.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = department
    ? "Select job title"
    : "Select department first";

  jobTitleSelect.appendChild(placeholderOption);

  jobTitles.forEach((jobTitle) => {
    const option = document.createElement("option");
    option.value = jobTitle;
    option.textContent = jobTitle;
    jobTitleSelect.appendChild(option);
  });

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
  // Preserve old/saved job titles during edit mode, even if that title
  // is not part of the controlled list yet.
  if (savedOrCurrentJobTitle) {
    const titleExists = jobTitles.some(
      (jobTitle) =>
        jobTitle.toLowerCase() === savedOrCurrentJobTitle.toLowerCase(),
    );

    if (titleExists) {
      jobTitleSelect.value = jobTitles.find(
        (jobTitle) =>
          jobTitle.toLowerCase() === savedOrCurrentJobTitle.toLowerCase(),
      );
    } else if (department) {
      const savedOption = document.createElement("option");
      savedOption.value = savedOrCurrentJobTitle;
      savedOption.textContent = `${savedOrCurrentJobTitle} (saved value)`;
      jobTitleSelect.appendChild(savedOption);
      jobTitleSelect.value = savedOrCurrentJobTitle;
    }
  }

  jobTitleSelect.disabled = !department;
  jobTitleSelect.classList.remove("is-invalid");

  updateEmployeeSaveButtonState();
}

function setEmployeeAccountPanel(accountLinkage = null) {
  const linkage = accountLinkage || {
    label: "No User Account",
    badgeClass: "text-bg-secondary",
    matchedEmail: "--",
    helperText: "No user account exists yet for this employee.",
  };

  if (state.dom.employeeAccountStatusBadge) {
    state.dom.employeeAccountStatusBadge.innerHTML = `
      <span class="badge ${linkage.badgeClass}">
        ${escapeHtml(linkage.label)}
      </span>
    `;
  }

  if (state.dom.employeeLinkedEmailValue) {
    state.dom.employeeLinkedEmailValue.textContent =
      linkage.matchedEmail || "--";
  }

  if (state.dom.employeePhotoSetupValue) {
    state.dom.employeePhotoSetupValue.textContent =
      linkage.helperText || "--";
  }
}

async function loadLatestHrProfile() {
  if (!state.currentUser?.id) return state.currentProfile;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", state.currentUser.id)
      .maybeSingle();

    if (error) throw error;
    if (data) state.currentProfile = data;
    return state.currentProfile;
  } catch (error) {
    console.error("Error loading latest HR profile:", error);
    return state.currentProfile;
  }
}

function showPageAlert(type, message) {
  if (!state.dom.pageAlert) return;
  state.dom.pageAlert.className = `alert alert-${type} mb-4`;
  state.dom.pageAlert.innerHTML = message;
  state.dom.pageAlert.classList.remove("d-none");
}

function clearPageAlert() {
  if (!state.dom.pageAlert) return;
  state.dom.pageAlert.className = "alert d-none mb-4";
  state.dom.pageAlert.textContent = "";
}

async function getSignedProfileImageUrl(filePath) {
  if (!filePath) return null;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .createSignedUrl(filePath, 3600);

    if (error) throw error;
    return data?.signedUrl || null;
  } catch (error) {
    console.error("Error creating signed profile image URL:", error);
    return null;
  }
}

function renderHrProfile(profile, user) {
  const fullName = profile?.full_name || "HR User";
  const email = profile?.email || user?.email || "No email";
  const role = String(profile?.role || "hr").toLowerCase();
  const department = profile?.department || "";
  const initials = getInitials(fullName, "HR");

  if (state.dom.hrInitials) {
    state.dom.hrInitials.textContent = initials;
    state.dom.hrInitials.classList.remove("d-none");
  }

  if (state.dom.hrEmail) state.dom.hrEmail.textContent = email;
  if (state.dom.hrRole) state.dom.hrRole.textContent = role;
  if (state.dom.hrProfileCardName) state.dom.hrProfileCardName.textContent = fullName;
  if (state.dom.hrProfileCardEmail) state.dom.hrProfileCardEmail.textContent = email;
  if (state.dom.hrProfileFullName) state.dom.hrProfileFullName.value = fullName;
  if (state.dom.hrProfileEmail) state.dom.hrProfileEmail.value = email;
  if (state.dom.hrProfileRole) state.dom.hrProfileRole.value = role;
  if (state.dom.hrProfileDepartment) state.dom.hrProfileDepartment.value = department;

  if (state.dom.hrProfileAvatar) {
    state.dom.hrProfileAvatar.textContent = initials;
    state.dom.hrProfileAvatar.classList.remove("d-none");
  }

  if (state.dom.hrProfileImagePreview) {
    state.dom.hrProfileImagePreview.src = "";
    state.dom.hrProfileImagePreview.classList.add("d-none");
  }

  if (state.dom.hrHeroImage) {
    state.dom.hrHeroImage.src = "";
    state.dom.hrHeroImage.classList.add("d-none");
  }

  void loadHrProfileImages(profile?.profile_image_path, initials);
}

async function loadHrProfileImages(profileImagePath, initials) {
  if (!profileImagePath) {
    if (state.dom.hrProfileAvatar) {
      state.dom.hrProfileAvatar.textContent = initials;
      state.dom.hrProfileAvatar.classList.remove("d-none");
    }

    if (state.dom.hrInitials) {
      state.dom.hrInitials.textContent = initials;
      state.dom.hrInitials.classList.remove("d-none");
    }

    if (state.dom.hrHeroImage) {
      state.dom.hrHeroImage.src = "";
      state.dom.hrHeroImage.classList.add("d-none");
    }

    return;
  }

  try {
    const signedImageUrl = await getSignedProfileImageUrl(profileImagePath);
    if (!signedImageUrl) return;

    if (state.dom.hrProfileImagePreview) {
      state.dom.hrProfileImagePreview.src = signedImageUrl;
      state.dom.hrProfileImagePreview.classList.remove("d-none");
    }

    if (state.dom.hrProfileAvatar) {
      state.dom.hrProfileAvatar.classList.add("d-none");
    }

    if (state.dom.hrHeroImage) {
      state.dom.hrHeroImage.src = signedImageUrl;
      state.dom.hrHeroImage.classList.remove("d-none");
    }

    if (state.dom.hrInitials) {
      state.dom.hrInitials.classList.add("d-none");
    }
  } catch (error) {
    console.error("Error lazy-loading HR profile image:", error);
  }
}

async function saveHrOwnProfile() {
  const fullName = String(state.dom.hrProfileFullName?.value || "").trim();
  const department = String(state.dom.hrProfileDepartment?.value || "").trim();

  if (!fullName) {
    showPageAlert("warning", "Full name is required before saving your profile.");
    state.dom.hrProfileFullName?.focus();
    return;
  }

  try {
    setProfileSaveLoading(true);

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        department: department || null,
      })
      .eq("id", state.currentUser.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    state.currentProfile = {
      ...state.currentProfile,
      ...(data || {}),
      full_name: fullName,
      department,
    };

    renderHrProfile(state.currentProfile, state.currentUser);
    showPageAlert("success", "Your profile was updated successfully.");
  } catch (error) {
    console.error("Error updating HR profile:", error);
    showPageAlert(
      "danger",
      error.message || "Your profile could not be updated.",
    );
  } finally {
    setProfileSaveLoading(false);
  }
}

function setProfileSaveLoading(isLoading) {
  const button = state.dom.saveHrProfileBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Saving...
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function setProfileImageSaveLoading(isLoading) {
  const button = state.dom.saveHrProfileImageBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Uploading...
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function handlePendingProfileImage(file) {
  state.pendingProfileImageFile = null;

  if (!file) {
    if (state.currentProfile) renderHrProfile(state.currentProfile, state.currentUser);
    return;
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  const maxBytes = 5 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    showPageAlert("warning", "Only PNG, JPG, JPEG, and WEBP images are allowed.");
    if (state.dom.hrProfileImageInput) state.dom.hrProfileImageInput.value = "";
    return;
  }

  if (file.size > maxBytes) {
    showPageAlert("warning", "Profile image must be 5MB or smaller.");
    if (state.dom.hrProfileImageInput) state.dom.hrProfileImageInput.value = "";
    return;
  }

  state.pendingProfileImageFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    if (state.dom.hrProfileImagePreview) {
      state.dom.hrProfileImagePreview.src = reader.result;
      state.dom.hrProfileImagePreview.classList.remove("d-none");
    }

    if (state.dom.hrProfileAvatar) {
      state.dom.hrProfileAvatar.classList.add("d-none");
    }

    if (state.dom.hrHeroImage) {
      state.dom.hrHeroImage.src = reader.result;
      state.dom.hrHeroImage.classList.remove("d-none");
    }

    if (state.dom.hrInitials) {
      state.dom.hrInitials.classList.add("d-none");
    }
  };
  reader.readAsDataURL(file);
}

async function uploadHrProfileImage() {
  if (!state.pendingProfileImageFile) {
    showPageAlert("warning", "Please choose an image before uploading.");
    return;
  }

  try {
    setProfileImageSaveLoading(true);

    const supabase = getSupabaseClient();
    const file = state.pendingProfileImageFile;
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const filePath = `${state.currentUser.id}/profile-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from("profiles")
      .update({
        profile_image_path: filePath,
      })
      .eq("id", state.currentUser.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;

    state.currentProfile = {
      ...state.currentProfile,
      ...(data || {}),
      profile_image_path: filePath,
    };

    state.pendingProfileImageFile = null;
    if (state.dom.hrProfileImageInput) state.dom.hrProfileImageInput.value = "";

    await loadLatestHrProfile();
    renderHrProfile(state.currentProfile, state.currentUser);

    showPageAlert("success", "Your profile photo was uploaded successfully.");
  } catch (error) {
    console.error("Error uploading HR profile image:", error);
    showPageAlert(
      "danger",
      error.message || "Profile photo could not be uploaded.",
    );
  } finally {
    setProfileImageSaveLoading(false);
  }
}

async function refreshEmployeeWorkspace() {
  renderEmployeeRecordsLoadingState();
  await loadAllEmployeeDocuments();
  await loadAuthProfilesForLinkage();
  await loadEmployees();

  // =========================================================
  // Keep payroll and employee bank dropdowns in sync with the
  // employee list loaded from the HR employee source.
  // =========================================================
  populatePayrollEmployeeOptions();
  populatePayrollMasterEmployeeOptions();

  // EMPLOYEE BANK DETAILS - STEP 4
  // Populate the Employee Bank Details employee dropdown from the same
  // HR employee records used by payroll.
  populateEmployeeBankEmployeeOptions();
}

async function loadAllEmployeeDocuments() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, employee_id, file_name, uploaded_at")
      .order("uploaded_at", { ascending: false });

    if (error) throw error;
    state.allEmployeeDocuments = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error loading all employee documents:", error);
    state.allEmployeeDocuments = [];
  }
}

async function loadAuthProfilesForLinkage() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role");

    if (error) throw error;
    state.authProfiles = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Error loading auth profiles for linkage:", error);
    state.authProfiles = [];
  }
}

async function loadEmployees() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.employees = Array.isArray(data) ? data : [];
    applyEmployeeSearch();
  } catch (error) {
    console.error("Error loading employee records:", error);
    showPageAlert(
      "danger",
      error.message || "Employee records could not be loaded.",
    );
    state.employees = [];
    state.filteredEmployees = [];
    renderEmployeeRecords([]);
    renderEmployeeSummary([]);
  }
}

function applyEmployeeSearch() {
  const searchTerm = normalizeText(state.dom.employeeSearchInput?.value || "");

  // BATCH PAYROLL DEFAULT - STEP 1
  // Normal Employee Management still shows all employees.
  // Run Payroll mode shows active employees only, because the batch payroll
  // table should not prepare inactive employees for a new payroll run.
  const employeeSource = state.isRunPayrollSelectionMode
    ? state.employees.filter(
      (employee) => normalizeText(employee.status) === "active",
    )
    : [...state.employees];

  if (!searchTerm) {
    state.filteredEmployees = employeeSource;
  } else {
    state.filteredEmployees = employeeSource.filter((employee) => {
      // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
      // Include optional Middle Name in Employee Management search.
      // This applies only to the main employee list search.
      const searchableText = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
        employee.work_email,
        employee.department,
        employee.job_title,
        employee.line_manager,
        employee.approver_email,
        employee.status,
        employee.employee_number,
        employee.phone_number,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  renderEmployeeSummary(state.employees);
  renderEmployeeRecords(state.filteredEmployees);
}

function buildEmployeeDocumentCountMap() {
  const countMap = new Map();

  state.allEmployeeDocuments.forEach((documentRow) => {
    const employeeId = String(documentRow.employee_id || "").trim();
    if (!employeeId) return;

    const existingCount = countMap.get(employeeId) || 0;
    countMap.set(employeeId, existingCount + 1);
  });

  return countMap;
}

function getEmployeeAccountLinkage(employee) {
  const employeeUserId = String(employee?.auth_user_id || employee?.user_id || "").trim();
  const workEmail = normalizeText(employee?.work_email || "");

  if (employeeUserId) {
    const linkedProfile =
      state.authProfiles.find(
        (profile) => String(profile.id || "").trim() === employeeUserId,
      ) || null;

    return {
      code: "linked",
      label: "Linked",
      badgeClass: "text-bg-success",
      matchedEmail: linkedProfile?.email || employee.work_email || "--",
      helperText: "This employee already has a user account linked.",
    };
  }

  const matchedProfile =
    state.authProfiles.find(
      (profile) => normalizeText(profile.email || "") === workEmail,
    ) || null;

  if (matchedProfile) {
    return {
      code: "matched",
      label: "Profile Found",
      badgeClass: "text-bg-warning",
      matchedEmail: matchedProfile.email || "--",
      helperText: "A matching user profile exists for this work email.",
    };
  }

  return {
    code: "unlinked",
    label: "No User Account",
    badgeClass: "text-bg-secondary",
    matchedEmail: "--",
    helperText: "No user account exists yet for this employee.",
  };
}

// DESCRIPTION ITEM 9 - STEP 1
// Payroll selection helpers for the Full Employee List.
// These keep each employee checkbox stable while the user searches,
// filters, collapses, or re-renders the list during the session.
function isEmployeeSelectedForPayroll(employeeId) {
  return state.selectedEmployeesForPayroll.has(String(employeeId));
}

// DESCRIPTION ITEM 9 - STEP 2
// Get the employee ids currently visible in the filtered employee list.
// The master checkbox should only act on what HR is currently viewing.
function getVisibleEmployeeIdsForPayrollSelection() {
  return (state.filteredEmployees || [])
    .map((employee) => String(employee?.id || "").trim())
    .filter(Boolean);
}

// DESCRIPTION ITEM 9 - STEP 2
// Keep the master header checkbox in sync with the visible row selections.
function syncSelectAllEmployeesForPayrollCheckbox() {
  const checkbox = state.dom.selectAllEmployeesForPayroll;
  const summary = state.dom.employeePayrollSelectionSummary;
  const visibleEmployeeIds = getVisibleEmployeeIdsForPayrollSelection();

  const selectedVisibleCount = visibleEmployeeIds.filter((employeeId) =>
    state.selectedEmployeesForPayroll.has(employeeId),
  ).length;

  // DESCRIPTION ITEM 9 - STEP 3
  // Keep the live payroll selection summary in sync with the visible list.
  if (summary) {
    summary.textContent =
      selectedVisibleCount === 1
        ? "1 employee selected for this month."
        : `${selectedVisibleCount} employees selected for this month.`;
  }

  // RUN PAYROLL - STEP 3
  // Keep the Run Payroll action row in sync with current employee selections.
  if (state.dom.runPayrollSelectedCount) {
    state.dom.runPayrollSelectedCount.textContent =
      selectedVisibleCount === 1
        ? "1 employee selected for this payroll run."
        : `${selectedVisibleCount} employees selected for this payroll run.`;
  }

  if (state.dom.continueRunPayrollBtn) {
    state.dom.continueRunPayrollBtn.disabled = selectedVisibleCount === 0;
  }

  if (!checkbox) return;

  if (!visibleEmployeeIds.length) {
    checkbox.checked = false;
    checkbox.indeterminate = false;
    checkbox.disabled = true;
    return;
  }

  checkbox.disabled = false;
  checkbox.checked = selectedVisibleCount === visibleEmployeeIds.length;
  checkbox.indeterminate =
    selectedVisibleCount > 0 &&
    selectedVisibleCount < visibleEmployeeIds.length;
}

function toggleEmployeePayrollSelection(employeeId, isChecked) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return;

  if (isChecked) {
    state.selectedEmployeesForPayroll.add(employeeKey);
  } else {
    state.selectedEmployeesForPayroll.delete(employeeKey);
  }

  // DESCRIPTION ITEM 9 - STEP 2
  // Re-sync the master checkbox whenever an individual row changes.
  syncSelectAllEmployeesForPayrollCheckbox();
}

// BATCH PAYROLL DEFAULT - STEP 11
// Removes one employee from the current Batch Payroll Review table.
// This gives HR a quick way to fix a blocked duplicate batch without
// going back to the employee list.
function removeEmployeeFromCurrentPayrollBatch(employeeId) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return;

  state.selectedEmployeesForPayroll.delete(employeeKey);

  const selectedEmployeeIds = Array.from(state.selectedEmployeesForPayroll || [])
    .map((selectedId) => String(selectedId || "").trim())
    .filter(Boolean);

  // BATCH PAYROLL DEFAULT - STEP 11
  // Clear any stale duplicate warning because the batch selection has changed.
  // Submit will re-check duplicates again when HR tries to submit.
  clearPageAlert();
  hideDashboardToast();

  renderBatchPayrollReviewTable(selectedEmployeeIds);
  syncSelectAllEmployeesForPayrollCheckbox();
  updateSubmitBatchPayrollButtonState();

  showDashboardToast(
    "info",
    "Employee removed",
    selectedEmployeeIds.length
      ? "The employee has been removed from this payroll batch."
      : "The employee has been removed. No employees remain in this payroll batch.",
  );
}

// DESCRIPTION ITEM 9 - STEP 2
// Select or clear all employees currently visible in the list.
// Re-render keeps every row checkbox visually in sync immediately.
function toggleAllVisibleEmployeesForPayroll(isChecked) {
  const visibleEmployeeIds = getVisibleEmployeeIdsForPayrollSelection();

  visibleEmployeeIds.forEach((employeeId) => {
    if (isChecked) {
      state.selectedEmployeesForPayroll.add(employeeId);
    } else {
      state.selectedEmployeesForPayroll.delete(employeeId);
    }
  });

  renderEmployeeRecords(state.filteredEmployees);
}

// DESCRIPTION ITEM 5 - SYNC FOUNDATION STEP 3C
// Use the latest payroll master record as a fallback source for payroll-owned
// fields that may not yet be populated on the HR employee record.
function getLatestPayrollMasterProfileForEmployee(employeeId) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return null;

  const matchingRecords = (state.payrollMasterRecords || []).filter(
    (record) => String(record.employee_id || "").trim() === employeeKey,
  );

  if (!matchingRecords.length) return null;

  matchingRecords.sort((a, b) => {
    const aDate = new Date(
      a.salary_effective_date || a.updated_at || a.created_at || 0,
    ).getTime();
    const bDate = new Date(
      b.salary_effective_date || b.updated_at || b.created_at || 0,
    ).getTime();

    return bDate - aDate;
  });

  return matchingRecords[0];
}

// BATCH PAYROLL DEFAULT - STEP 3
// Returns the latest ACTIVE payroll master record for one employee.
// Batch payroll must not use inactive payroll master records for salary lookup.
// This helper is read-only for now; blocking inactive/missing records comes next.
function getLatestActivePayrollMasterProfileForEmployee(employeeId) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return null;

  const activeMatchingRecords = (state.payrollMasterRecords || []).filter(
    (record) =>
      String(record.employee_id || "").trim() === employeeKey &&
      normalizeText(record.payroll_status) === "active",
  );

  if (!activeMatchingRecords.length) return null;

  activeMatchingRecords.sort((a, b) => {
    const aDate = new Date(
      a.salary_effective_date || a.updated_at || a.created_at || 0,
    ).getTime();

    const bDate = new Date(
      b.salary_effective_date || b.updated_at || b.created_at || 0,
    ).getTime();

    return bDate - aDate;
  });

  return activeMatchingRecords[0];
}

// BATCH PAYROLL DEFAULT - STEP 4
// Shows a blocking setup warning for selected employees who do not have
// a valid active Payroll Master record.
// This does not save payroll yet; it only prevents HR from treating the
// batch as ready before the missing setup is corrected.
function renderBatchPayrollSetupWarning(selectedEmployees = []) {
  const warning = state.dom.batchPayrollSetupWarning;
  if (!warning) return;

  const affectedEmployees = selectedEmployees.filter((employee) => {
    const activePayrollMaster =
      getLatestActivePayrollMasterProfileForEmployee(employee.id);

    const salaryValue = Number(activePayrollMaster?.basic_salary || 0);

    return !(
      activePayrollMaster &&
      Number.isFinite(salaryValue) &&
      salaryValue > 0
    );
  });

  if (!affectedEmployees.length) {
    warning.innerHTML = "";
    warning.classList.add("d-none");
    return;
  }

  const affectedNames = affectedEmployees.slice(0, 5).map((employee) => {
    return (
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.work_email ||
      employee.employee_number ||
      "Unknown Employee"
    );
  });

  const extraCount = affectedEmployees.length - affectedNames.length;

  warning.innerHTML = `
    <div class="fw-semibold">Batch payroll setup is incomplete.</div>
    <div class="small">
      ${affectedEmployees.length} selected employee(s) cannot be processed yet because they do not have a valid active Payroll Master setup.
      Affected: <strong>${escapeHtml(affectedNames.join(", "))}${extraCount > 0 ? `, and ${extraCount} more` : ""}</strong>.
      Update Payroll Master Data before continuing this batch.
    </div>
  `;

  warning.classList.remove("d-none");
}

// BATCH PAYROLL DEFAULT - STEP 7
// Enables Submit Batch Payroll only when the batch has:
// 1. at least one prepared payroll row,
// 2. a selected pay period,
// 3. a selected pay date.
// Missing Payroll Master setup is already handled by the prepared row count.
function updateSubmitBatchPayrollButtonState() {
  const button = state.dom.submitBatchPayrollBtn;
  if (!button) return;

  const hasPreparedRows = (state.batchPayrollPreparedRows || []).length > 0;
  const hasPayCycle = Boolean(
    String(state.dom.batchPayrollPayCycle?.value || "").trim(),
  );
  const hasPayDate = Boolean(
    String(state.dom.batchPayrollPayDate?.value || "").trim(),
  );

  button.disabled = !(hasPreparedRows && hasPayCycle && hasPayDate);
}
// BATCH PAYROLL DEFAULT - STEP 5
// Build one calculated payroll preview row for one selected employee.
// This mirrors the existing Regular payroll structure without relying on
// the hidden individual payroll form fields.
//
// This step only prepares values in memory. It does not save payroll records.
function buildBatchPayrollPreparedRow(employee, activePayrollMaster) {
  const baseSalary = Number(activePayrollMaster?.basic_salary || 0);

  if (!employee?.id || !activePayrollMaster?.id || !Number.isFinite(baseSalary) || baseSalary <= 0) {
    return null;
  }

  // BATCH PAYROLL DEFAULT - STEP 5
  // Regular structure defaults copied from the existing payroll calculation behaviour:
  // 5% increment, then 50/10/10/10/20 salary split.
  const incrementAmount = baseSalary * 0.05;
  const newBaseSalary = baseSalary + incrementAmount;

  const basicPay = newBaseSalary * 0.5;
  const housingAllowance = newBaseSalary * 0.1;
  const transportAllowance = newBaseSalary * 0.1;
  const utilityAllowance = newBaseSalary * 0.1;
  const otherAllowance = newBaseSalary * 0.2;

  const bht = basicPay + housingAllowance + transportAllowance;
  const employeePension = bht * 0.08;
  const employerPension = bht * 0.1;

  const grossPay =
    basicPay +
    housingAllowance +
    transportAllowance +
    utilityAllowance +
    otherAllowance;

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 6
  // Batch Payroll must use the same NTA 2025 PAYE calculation as the
  // individual payroll form. WHT and Other Deductions remain 0 in batch
  // because batch mode does not collect manual deduction inputs.
  const payeTax = calculateNta2025MonthlyPayeTaxFromComponents({
    basicPay,
    housingAllowance,
    transportAllowance,
    utilityAllowance,
    otherAllowance,
    medicalAllowance: 0,
    bonus: 0,
    overtime: 0,
    logisticsAllowance: 0,
    dataAirtimeAllowance: 0,
  });

  const whtTax = 0;
  const otherDeductions = 0;

  const totalDeductions = employeePension + payeTax + whtTax + otherDeductions;
  const netPay = grossPay - totalDeductions;

  return {
    employee_id: employee.id,
    payroll_master_record_id: activePayrollMaster.id,
    pay_cycle: activePayrollMaster.pay_cycle || "",
    payroll_group: "REGULAR",
    payroll_model: "REGULAR",

    base_salary: baseSalary,
    regular_increment_percent: 5,
    regular_increment_amount: incrementAmount,
    regular_new_base_salary: newBaseSalary,

    basic_pay: basicPay,
    housing_allowance: housingAllowance,
    transport_allowance: transportAllowance,
    utility_allowance: utilityAllowance,
    other_allowance: otherAllowance,

    employee_pension: employeePension,
    employer_pension: employerPension,

    // PAYROLL TAX DEDUCTION CALCULATION - STEP 6
    // Keep batch PAYE/WHT/Other Deductions explicit so the saved
    // payroll_records row matches the batch preview calculation.
    paye_tax: payeTax,
    wht_tax: whtTax,
    other_deductions: otherDeductions,

    gross_pay: grossPay,
    total_deductions: totalDeductions,
    net_pay: netPay,

    currency: "NGN",
  };
}
// BATCH PAYROLL DEFAULT - STEP 7
// Converts one prepared batch preview row into a payroll_records payload.
// This deliberately does not use the hidden individual payroll form fields.
function buildBatchPayrollRecordPayload(preparedRow) {
  const payCycle = String(state.dom.batchPayrollPayCycle?.value || "").trim();
  const payDate = String(state.dom.batchPayrollPayDate?.value || "").trim();

  return {
    employee_id: preparedRow.employee_id,
    pay_cycle: payCycle,
    pay_date: payDate || null,

    employee_group: "REGULAR",
    payroll_model: "REGULAR",
    payroll_model_version: "rev2",
    structure_variant: "ALPATECH_REGULAR_REV2",
    payslip_layout: "ALPATECH_REGULAR_REV2",

    increment_percent: 0.05,
    increment_amount: preparedRow.regular_increment_amount,
    merit_increment: null,
    new_base_salary: preparedRow.regular_new_base_salary,

    basic_percent: 0.5,
    housing_percent: 0.1,
    transport_percent: 0.1,
    utility_percent: 0.1,
    other_allowance_percent: 0.2,

    base_salary: preparedRow.base_salary,
    basic_pay: preparedRow.basic_pay,
    housing_allowance: preparedRow.housing_allowance,
    transport_allowance: preparedRow.transport_allowance,
    utility_allowance: preparedRow.utility_allowance,
    medical_allowance: null,
    other_allowance: preparedRow.other_allowance,
    bonus: null,
    overtime: null,
    logistics_allowance: null,
    data_airtime_allowance: null,

    bht:
      preparedRow.basic_pay +
      preparedRow.housing_allowance +
      preparedRow.transport_allowance,

    monthly_salary_plus_logistics: null,
    employer_wht: null,

    gross_pay: preparedRow.gross_pay,

    // PAYROLL TAX DEDUCTION CALCULATION - STEP 6
    // Save the PAYE calculated during batch preparation.
    // WHT remains 0 for Regular batch payroll because it is not normally
    // applied to standard employee salary.
    paye_tax: preparedRow.paye_tax,
    wht_tax: preparedRow.wht_tax,
    employee_pension: preparedRow.employee_pension,
    employer_pension: preparedRow.employer_pension,

    // BATCH PAYROLL DEFAULT - STEP 7A
    // payroll_records.other_deductions is not nullable in Supabase.
    // Batch payroll has no extra manual deductions yet, so save this as 0.
    other_deductions: preparedRow.other_deductions,
    total_deductions: preparedRow.total_deductions,
    net_pay: preparedRow.net_pay,

    currency: "NGN",
    status: "Authorised",
    is_finalised: true,

    notes: "Created from batch payroll run.",
    processed_by: state.currentUser?.id || null,
    approved_by: state.currentUser?.id || null,
    approved_at: new Date().toISOString(),
  };
}

// BATCH PAYROLL DEFAULT - STEP 8
// Checks whether selected employees already have payroll records
// for the selected batch pay period.
// This prevents accidental duplicate payroll records for the same
// employee and pay cycle when HR clicks Submit Batch Payroll again.
async function getExistingBatchPayrollRecordsForPeriod(payCycle, employeeIds = []) {
  const cleanPayCycle = String(payCycle || "").trim();

  const cleanEmployeeIds = employeeIds
    .map((employeeId) => String(employeeId || "").trim())
    .filter(Boolean);

  if (!cleanPayCycle || !cleanEmployeeIds.length) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("hr_payroll_overview")
    .select("id, employee_id, pay_cycle, first_name, last_name, work_email")
    .eq("pay_cycle", cleanPayCycle)
    .in("employee_id", cleanEmployeeIds);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? data : [];
}

function renderEmployeeSummary(employees) {
  const activeEmployees = employees.filter(
    (employee) => normalizeText(employee.status) === "active",
  ).length;

  const uniqueDepartments = new Set(
    employees
      .map((employee) => String(employee.department || "").trim())
      .filter(Boolean),
  );

  const missingEmployeeNumbers = employees.filter(
    (employee) => !String(employee.employee_number || "").trim(),
  ).length;

  if (state.dom.totalEmployeesValue) {
    state.dom.totalEmployeesValue.textContent = String(employees.length);
  }

  if (state.dom.activeEmployeesValue) {
    state.dom.activeEmployeesValue.textContent = String(activeEmployees);
  }

  if (state.dom.departmentsValue) {
    state.dom.departmentsValue.textContent = String(uniqueDepartments.size);
  }

  if (state.dom.missingEmployeeNumberValue) {
    state.dom.missingEmployeeNumberValue.textContent = String(
      missingEmployeeNumbers,
    );
  }
}

function renderEmployeeRecordsLoadingState() {
  if (!state.dom.employeeRecordsTableBody) return;

  if (state.dom.employeeRecordsEmptyState) {
    state.dom.employeeRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.employeeRecordsTableWrapper) {
    state.dom.employeeRecordsTableWrapper.classList.remove("d-none");
  }

  // DESCRIPTION ITEM 9 - STEP 2
  // Reset the master payroll checkbox while the employee list is loading.
  if (state.dom.selectAllEmployeesForPayroll) {
    state.dom.selectAllEmployeesForPayroll.checked = false;
    state.dom.selectAllEmployeesForPayroll.indeterminate = false;
    state.dom.selectAllEmployeesForPayroll.disabled = true;
  }

  // DESCRIPTION ITEM 9 - STEP 3
  // Reset the payroll selection summary while the employee list is loading.
  if (state.dom.employeePayrollSelectionSummary) {
    state.dom.employeePayrollSelectionSummary.textContent =
      "Loading payroll selection...";
  }

  state.dom.employeeRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="10" class="text-center text-secondary py-4">
        Loading employee records.
      </td>
    </tr>
  `;
}

function renderEmployeeRecords(employees) {
  const tbody = state.dom.employeeRecordsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!employees.length) {
    if (state.dom.employeeRecordsEmptyState) {
      state.dom.employeeRecordsEmptyState.classList.remove("d-none");
    }
    if (state.dom.employeeRecordsTableWrapper) {
      state.dom.employeeRecordsTableWrapper.classList.add("d-none");
    }

    // DESCRIPTION ITEM 9 - STEP 2
    // Keep the master checkbox disabled when no visible employees remain.
    syncSelectAllEmployeesForPayrollCheckbox();
    return;
  }

  if (state.dom.employeeRecordsEmptyState) {
    state.dom.employeeRecordsEmptyState.classList.add("d-none");
  }
  if (state.dom.employeeRecordsTableWrapper) {
    state.dom.employeeRecordsTableWrapper.classList.remove("d-none");
  }

  const documentCountMap = buildEmployeeDocumentCountMap();

  // REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
  // Show the newest/most recently updated employee first in the list.
  const employeesToRender = sortEmployeeRecordsByLatestActivity(employees);

  employeesToRender.forEach((employee) => {
// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
// Show full employee identity using First + Middle + Last where available.
const fullName = [
  employee.first_name,
  employee.middle_name,
  employee.last_name,
]
  .map((namePart) => String(namePart || "").trim())
  .filter(Boolean)
  .join(" ");
    const documentCount = documentCountMap.get(String(employee.id)) || 0;
    const accountLinkage = getEmployeeAccountLinkage(employee);

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1L
    // Grade has been fully removed from the active HR/payroll display.
    // Keep Payroll Master lookup only for salary and pay cycle visibility.
    const latestPayrollProfile = getLatestPayrollMasterProfileForEmployee(employee.id);

    // DESCRIPTION ITEM 5 - STEP 4
    // Resolve salary and pay cycle from the latest payroll master record.
    // This completes payroll visibility without adding another table column.
    const resolvedBaseSalary = latestPayrollProfile?.basic_salary
      ? formatCurrency(latestPayrollProfile.basic_salary, "NGN")
      : "";

    const resolvedPayCycle =
      String(latestPayrollProfile?.pay_cycle || "").trim();

    const resolvedPayInfo =
      resolvedBaseSalary && resolvedPayCycle
        ? `${resolvedBaseSalary} • ${resolvedPayCycle}`
        : resolvedBaseSalary || resolvedPayCycle || "";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="text-center">
        <!-- DESCRIPTION ITEM 9 - STEP 1
             Add a payroll selection checkbox beside each employee row
             so HR can mark who should be included in the current month's pay run. -->
        <input
          type="checkbox"
          class="form-check-input mt-0"
          aria-label="Select employee for payroll"
          ${isEmployeeSelectedForPayroll(employee.id) ? "checked" : ""}
          onchange="window.hrToggleEmployeePayrollSelection('${String(employee.id).replaceAll("'", "\\'")}', this.checked)"
        />
      </td>

<td>
  <!-- DESCRIPTION ITEM 5 - STEP 1
       Fold the key reporting detail into the Employee cell so the table
       gains space for later HR detail expansion without widening further. -->
  <div class="fw-semibold">${escapeHtml(fullName || "Unnamed Employee")}</div>
  <div class="text-secondary small">
    ${escapeHtml(employee.employee_number || "--")}
  </div>
  <div class="text-secondary small">
    Mgr: ${escapeHtml(employee.line_manager || "--")}
  </div>
</td>

      <td>
        <!-- DESCRIPTION ITEM 1 - STEP 3
             Group contact details together to reduce table width. -->
        <div class="text-break">${escapeHtml(employee.work_email || "--")}</div>
        <div class="text-secondary small">
          ${escapeHtml(employee.phone_number || "--")}
        </div>
      </td>

<td>
  <!-- EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1L
       Grade removed from the Employee List Role cell.
       Role now shows department, job title, and payroll salary/cycle only. -->
  <div>${escapeHtml(employee.department || "--")}</div>
  <div class="text-secondary small">
    ${escapeHtml(employee.job_title || "--")}
  </div>
${resolvedPayInfo
        ? `<div class="text-secondary small text-nowrap" style="white-space:nowrap;">${escapeHtml(resolvedPayInfo)}</div>`
        : ""
      }
</td>

      <td>
        <span class="badge ${getStatusBadgeClass(employee.status)}">
          ${escapeHtml(formatStatusLabel(employee.status))}
        </span>
      </td>

      <td>
        <!-- DESCRIPTION ITEM 1 - STEP 4
             Keep account status simple here since contact details are already shown
             in the Contact column. -->
        <span class="badge ${accountLinkage.badgeClass}">
          ${escapeHtml(accountLinkage.label)}
        </span>
      </td>

      <td>
        <!-- DESCRIPTION ITEM 1 - STEP 4
             Show documents as a compact icon + count only so the table stays cleaner. -->
        <span class="badge ${documentCount > 0 ? "text-bg-info" : "text-bg-light border text-dark"} text-nowrap">
          <i class="bi bi-paperclip me-1"></i>${documentCount}
        </span>
      </td>

      <td class="text-nowrap">
        <!-- DESCRIPTION ITEM 1 - STEP 4
             Prevent the start date from wrapping awkwardly in narrower widths. -->
        ${formatDate(employee.employment_date)}
      </td>

      <td class="text-center">
        <!-- DESCRIPTION ITEM 1 - STEP 3
             Use compact icon-only actions so the row stays clean and inline. -->
        <div class="d-inline-flex align-items-center gap-2 flex-nowrap">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            title="Edit employee"
            aria-label="Edit employee"
            onclick="window.hrEditEmployee('${String(employee.id).replaceAll("'", "\\'")}')"
          >
            <i class="bi bi-pencil-square"></i>
          </button>

          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            title="View employee documents"
            aria-label="View employee documents"
            onclick="window.hrViewEmployeeDocuments('${String(employee.id).replaceAll("'", "\\'")}')"
          >
            <i class="bi bi-paperclip"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });

  // DESCRIPTION ITEM 9 - STEP 2
  // Recalculate the master checkbox state after every table render.
  syncSelectAllEmployeesForPayrollCheckbox();
}

function resetEmployeeForm() {
  if (!state.dom.employeeCreateForm) return;

  state.dom.employeeCreateForm.reset();
  state.currentEditingEmployee = null;

const fieldsToReset = [
  state.dom.firstName,

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
  // Clear optional Middle Name when the employee form resets.
  state.dom.middleName,

  state.dom.lastName,
  state.dom.workEmail,
  state.dom.phoneNumber,
  state.dom.department,
    state.dom.jobTitle,

    state.dom.lineManager,
    state.dom.employmentDate,
    state.dom.approverEmail,
    state.dom.employeeNumber,
    state.dom.employmentStatus,
    state.dom.systemRole,
  ];

  fieldsToReset.forEach((field) => {
    field?.classList.remove("is-invalid");
  });

  if (state.dom.editingEmployeeId) state.dom.editingEmployeeId.value = "";

  setSelectValueIfPresent(state.dom.employmentStatus, "active", ["Active"]);

  if (state.dom.systemRole) state.dom.systemRole.value = "";

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
  // After clearing the form, Job Title should wait for Department selection.
  populateJobTitleOptionsForDepartment("");

  if (state.dom.employeeDocumentsInput) state.dom.employeeDocumentsInput.value = "";

  // DESCRIPTION ITEM 10 - STEP 2
  // Reset the document type selector when returning the employee form to a clean state.
  if (state.dom.employeeDocumentType) state.dom.employeeDocumentType.value = "";

  state.pendingFiles = [];
  state.attachedDocuments = [];

  renderPendingFiles();
  renderAttachedDocuments();
  setEmployeeAccountPanel();

  if (state.dom.employeeFormTitle) {
    state.dom.employeeFormTitle.textContent = "Create Employee Profile";
  }

  if (state.dom.employeeFormSubtext) {
    state.dom.employeeFormSubtext.innerHTML =
      'Enter employee bio data and employment details. Fields marked with <span class="text-danger">*</span> are required.';
  }

  if (state.dom.employeeFormModeBadge) {
    state.dom.employeeFormModeBadge.textContent = "Create Mode";
    state.dom.employeeFormModeBadge.className =
      "badge rounded-pill text-bg-light border px-3 py-2";
  }

  if (state.dom.saveEmployeeBtn) {
    state.dom.saveEmployeeBtn.innerHTML = `
      <i class="bi bi-person-plus me-2"></i>
      <span id="saveEmployeeBtnText">Create Employee Profile</span>
    `;
    state.dom.saveEmployeeBtnText = document.getElementById("saveEmployeeBtnText");
  }

  if (state.dom.cancelEditBtn) {
    state.dom.cancelEditBtn.classList.add("d-none");
  }

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1D FIX
  // After clearing or returning to create mode, the form is incomplete,
  // so the employee save button must return to grey/disabled.
  updateEmployeeSaveButtonState();

  clearPageAlert();
}

function enterEmployeeEditMode(employee) {
  state.currentEditingEmployee = employee;

  if (state.dom.editingEmployeeId) state.dom.editingEmployeeId.value = employee.id || "";
if (state.dom.firstName) state.dom.firstName.value = employee.first_name || "";

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
// Load optional Middle Name when HR edits an employee profile.
if (state.dom.middleName) state.dom.middleName.value = employee.middle_name || "";

if (state.dom.lastName) state.dom.lastName.value = employee.last_name || "";
if (state.dom.workEmail) state.dom.workEmail.value = employee.work_email || "";
  if (state.dom.phoneNumber) state.dom.phoneNumber.value = employee.phone_number || "";
  if (state.dom.department) state.dom.department.value = employee.department || "";

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1F
  // Edit mode must rebuild the Job Title list for the saved Department,
  // then select the employee's saved Job Title.
  populateJobTitleOptionsForDepartment(employee.job_title || "");

  if (state.dom.lineManager) state.dom.lineManager.value = employee.line_manager || "";
  if (state.dom.employmentDate) state.dom.employmentDate.value = employee.employment_date || "";
  if (state.dom.approverEmail) state.dom.approverEmail.value = employee.approver_email || "";
  if (state.dom.employeeNumber) state.dom.employeeNumber.value = employee.employee_number || "";

  setSelectValueIfPresent(state.dom.employmentStatus, employee.status, [
    "active",
    "Active",
  ]);

  if (state.dom.systemRole) state.dom.systemRole.value = "";

  setEmployeeAccountPanel(getEmployeeAccountLinkage(employee));

  if (state.dom.employeeFormTitle) {
    state.dom.employeeFormTitle.textContent = "Edit Employee Profile";
  }

  if (state.dom.employeeFormSubtext) {
    state.dom.employeeFormSubtext.innerHTML =
      'Update employee bio data, employment details, and supporting documents. Fields marked with <span class="text-danger">*</span> are required.';
  }

  if (state.dom.employeeFormModeBadge) {
    state.dom.employeeFormModeBadge.textContent = "Edit Mode";
    state.dom.employeeFormModeBadge.className =
      "badge rounded-pill text-bg-primary px-3 py-2";
  }

  if (state.dom.saveEmployeeBtn) {
    state.dom.saveEmployeeBtn.innerHTML = `
      <i class="bi bi-person-check me-2"></i>
      <span id="saveEmployeeBtnText">Update Employee Profile</span>
    `;
    state.dom.saveEmployeeBtnText = document.getElementById("saveEmployeeBtnText");
  }

  if (state.dom.cancelEditBtn) {
    state.dom.cancelEditBtn.classList.remove("d-none");
  }

  state.pendingFiles = [];
  if (state.dom.employeeDocumentsInput) {
    state.dom.employeeDocumentsInput.value = "";
  }

  renderPendingFiles();
  switchHrWorkspace("employees");

  // REMOVE GRADE LEVEL FIELD FROM EMPLOYEE DATA - STEP 3
  // Editing an employee should always reopen the Create/Edit Employee card,
  // even if HR previously collapsed it after saving.
  openEmployeeFormCard();

  void loadEmployeeDocuments(employee.id);

   // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1D FIX
  // Edit mode loads existing values into the form, so recalculate whether
  // the Update Employee button should be enabled.
  updateEmployeeSaveButtonState();

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H RECOVERY
  // Edit mode should land on the full Employee Profile card, not inside the form.
  // This keeps the "Edit Employee Profile" heading and action buttons visible.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const employeeFormCard =
        state.dom.employeeFormTitle?.closest(".dashboard-section-card") ||
        state.dom.employeeCreateForm?.closest(".dashboard-section-card") ||
        state.dom.employeeCreateForm;

      scrollToDashboardTarget(employeeFormCard, 16);
    });
  });
}

function exitEmployeeEditMode() {
  resetEmployeeForm();
}

function startEmployeeEdit(employeeId, options = {}) {
  const employee = state.employees.find(
    (item) => String(item.id) === String(employeeId),
  );

  if (!employee) {
    showPageAlert(
      "warning",
      "The selected employee record could not be found. Please refresh and try again.",
    );
    return;
  }

  clearPageAlert();
  enterEmployeeEditMode(employee);

  if (options.focusDocuments) {
    setTimeout(() => {
      state.dom.attachedDocumentsList?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 250);
  }
}

function validateEmailField(field, { required = false } = {}) {
  if (!field) return true;

  const emailValue = String(field.value || "").trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailValue) {
    if (required) {
      field.classList.add("is-invalid");
      return false;
    }
    field.classList.remove("is-invalid");
    return true;
  }

  if (!emailPattern.test(emailValue)) {
    field.classList.add("is-invalid");
    return false;
  }

  field.classList.remove("is-invalid");
  return true;
}

function validateEmployeeForm() {
  let isValid = true;
  let firstInvalidField = null;

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
  // Line Manager is now optional. Approver Email remains the workflow field,
  // so employee creation should not be blocked by an empty Line Manager.
  const requiredFields = [
    state.dom.firstName,
    state.dom.lastName,
    state.dom.workEmail,
    state.dom.department,
    state.dom.jobTitle,
    state.dom.employmentDate,
  ];

  state.dom.lineManager?.classList.remove("is-invalid");

  requiredFields.forEach((field) => {
    const value = String(field?.value || "").trim();

    if (!value) {
      field?.classList.add("is-invalid");
      isValid = false;
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field?.classList.remove("is-invalid");
    }
  });

  if (!validateEmailField(state.dom.workEmail, { required: true })) {
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.workEmail;
  }

  if (!validateEmailField(state.dom.approverEmail, { required: false })) {
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.approverEmail;
  }

  if (!isValid && firstInvalidField?.focus) {
    firstInvalidField.focus();
  }

  return isValid;
}

function buildEmployeePayload() {
  const approverEmail = String(state.dom.approverEmail?.value || "")
    .trim()
    .toLowerCase();

  const rawStatus = String(
    state.dom.employmentStatus?.value || "active",
  ).trim();

return {
  first_name: String(state.dom.firstName?.value || "").trim(),

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
  // Middle Name is optional, so save blank values as null.
  middle_name: String(state.dom.middleName?.value || "").trim() || null,

  last_name: String(state.dom.lastName?.value || "").trim(),
  work_email: String(state.dom.workEmail?.value || "")
      .trim()
      .toLowerCase(),
    phone_number: String(state.dom.phoneNumber?.value || "").trim() || null,
    department: String(state.dom.department?.value || "").trim(),
    job_title: String(state.dom.jobTitle?.value || "").trim(),

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
    // Line Manager is optional, so save blank values as null.
    line_manager: String(state.dom.lineManager?.value || "").trim() || null,
    employment_date: state.dom.employmentDate?.value || null,
    approver_email: approverEmail || null,
    employee_number:
      String(state.dom.employeeNumber?.value || "").trim() || null,
    status: normalizeText(rawStatus) || "active",
  };
}



// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
// New employee custom IDs must start from P21 because P1-P20 already exist.
// Keep this helper block only once in the file to avoid breaking the dashboard.
const EMPLOYEE_CUSTOM_ID_PREFIX = "P";
const EMPLOYEE_CUSTOM_ID_START_NUMBER = 21;

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
// Reads IDs like P1, P20, P021, or p21 and returns the number part.
// Existing non-P IDs like EMP001 are ignored so they do not affect the P sequence.
function getEmployeeCustomIdNumber(employeeNumber) {
  const value = String(employeeNumber || "").trim();
  const match = value.match(/^P(\d+)$/i);

  if (!match) return null;

  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) ? numericValue : null;
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
// Formats the generated employee ID using the agreed P-number format.
function formatEmployeeCustomId(sequenceNumber) {
  return `${EMPLOYEE_CUSTOM_ID_PREFIX}${sequenceNumber}`;
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
// Generates the next available employee custom ID from Supabase.
// This avoids relying only on the browser state and helps prevent duplicates.
async function generateNextEmployeeCustomId() {
  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1P.2
  // Employee Number is now generated by Supabase RPC instead of the browser.
  // This is safer for HR/payroll because the database sequence prevents
  // two users from accidentally receiving the same next employee number.
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("get_next_employee_number");

  if (error) {
    throw new Error(
      error.message || "Could not generate the next Employee Number.",
    );
  }

  const generatedEmployeeNumber = String(data || "").trim();

  if (!generatedEmployeeNumber) {
    throw new Error("The database did not return a valid Employee Number.");
  }

  return generatedEmployeeNumber;
}

async function checkDuplicateEmployee(workEmail, currentEmployeeId = null) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("employees")
    .select("id, work_email")
    .eq("work_email", workEmail);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.find((row) => String(row.id) !== String(currentEmployeeId || ""));
}

function sanitizeFileName(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function isAllowedDocumentType(file) {
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
  ];

  const lowerName = String(file?.name || "").toLowerCase();
  const allowedExtensions = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];

  return (
    allowedMimeTypes.includes(file.type) ||
    allowedExtensions.some((extension) => lowerName.endsWith(extension))
  );
}

function addPendingFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  // DESCRIPTION ITEM 10 - STEP 2
  // Require HR to choose a document type before adding files,
  // so each pending upload carries a usable classification.
  const selectedDocumentType = String(
    state.dom.employeeDocumentType?.value || "",
  ).trim();

  if (!selectedDocumentType) {
    showPageAlert(
      "warning",
      "Please select a document type before attaching supporting documents.",
    );

    if (state.dom.employeeDocumentsInput) {
      state.dom.employeeDocumentsInput.value = "";
    }

    state.dom.employeeDocumentType?.focus();
    return;
  }

  const validationErrors = [];
  const maxFileSizeBytes = 10 * 1024 * 1024;

  files.forEach((file) => {
    const isDuplicate = state.pendingFiles.some((pendingItem) => {
      const pendingFile = pendingItem?.file || pendingItem;

      return (
        pendingFile?.name === file.name &&
        pendingFile?.size === file.size &&
        pendingFile?.lastModified === file.lastModified
      );
    });

    if (isDuplicate) {
      validationErrors.push(`${file.name} is already in the pending upload list.`);
      return;
    }

    if (!isAllowedDocumentType(file)) {
      validationErrors.push(`${file.name} is not an allowed file type.`);
      return;
    }

    if (file.size > maxFileSizeBytes) {
      validationErrors.push(`${file.name} is larger than 10MB.`);
      return;
    }

    state.pendingFiles.push({
      file,
      documentType: selectedDocumentType,
    });
  });

  if (state.dom.employeeDocumentsInput) {
    state.dom.employeeDocumentsInput.value = "";
  }

  if (state.dom.employeeDocumentType) {
    state.dom.employeeDocumentType.value = "";
  }

  renderPendingFiles();

  if (validationErrors.length) {
    showPageAlert("warning", validationErrors.join("<br />"));
  } else {
    clearPageAlert();
  }
}

function clearPendingFiles() {
  state.pendingFiles = [];

  // DESCRIPTION ITEM 10 - STEP 2
  // Reset both the file input and document type selector together.
  if (state.dom.employeeDocumentsInput) {
    state.dom.employeeDocumentsInput.value = "";
  }

  if (state.dom.employeeDocumentType) {
    state.dom.employeeDocumentType.value = "";
  }

  renderPendingFiles();
}

function renderPendingFiles() {
  const emptyState = state.dom.pendingDocumentsEmptyState;
  const list = state.dom.pendingDocumentsList;

  if (!emptyState || !list) return;

  list.innerHTML = "";

  if (!state.pendingFiles.length) {
    emptyState.classList.remove("d-none");
    list.classList.add("d-none");
    return;
  }

  emptyState.classList.add("d-none");
  list.classList.remove("d-none");

  state.pendingFiles.forEach((pendingItem, index) => {
    const file = pendingItem?.file || pendingItem;
    const documentType = String(
      pendingItem?.documentType || "Unclassified",
    ).trim();

    const item = document.createElement("div");
    item.className =
      "list-group-item d-flex justify-content-between align-items-center gap-3 flex-wrap";

    item.innerHTML = `
      <div>
        <div class="fw-semibold">${escapeHtml(file.name || "Unnamed file")}</div>
        <div class="text-secondary small">
          ${escapeHtml(documentType)} •
          ${escapeHtml(file.type || "Unknown type")} •
          ${formatBytes(file.size)}
        </div>
      </div>

      <button
        type="button"
        class="btn btn-sm btn-outline-danger"
        data-pending-file-index="${index}"
      >
        Remove
      </button>
    `;

    const removeButton = item.querySelector("[data-pending-file-index]");
    removeButton?.addEventListener("click", () => {
      state.pendingFiles.splice(index, 1);
      renderPendingFiles();
    });

    list.appendChild(item);
  });
}

async function loadEmployeeDocuments(employeeId) {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("employee_documents")
      .select("*")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false });

    if (error) throw error;

    state.attachedDocuments = Array.isArray(data) ? data : [];
    renderAttachedDocuments();
  } catch (error) {
    console.error("Error loading employee documents:", error);
    showPageAlert(
      "warning",
      error.message ||
      "Employee documents could not be loaded. Employee create and edit still remain available.",
    );
    state.attachedDocuments = [];
    renderAttachedDocuments();
  }
}

function renderAttachedDocuments() {
  const emptyState = state.dom.attachedDocumentsEmptyState;
  const list = state.dom.attachedDocumentsList;

  if (!emptyState || !list) return;

  list.innerHTML = "";

  if (!state.attachedDocuments.length) {
    emptyState.classList.remove("d-none");
    list.classList.add("d-none");
    return;
  }

  emptyState.classList.add("d-none");
  list.classList.remove("d-none");

  state.attachedDocuments.forEach((documentRow) => {
    const item = document.createElement("div");
    item.className =
      "list-group-item d-flex justify-content-between align-items-center gap-3 flex-wrap";

    item.innerHTML = `
      <div>
        <div class="fw-semibold">${escapeHtml(documentRow.file_name)}</div>
        <div class="text-secondary small">
          ${escapeHtml(documentRow.document_type || "Unclassified")} •
          ${escapeHtml(documentRow.mime_type || "Unknown type")} •
          ${formatBytes(documentRow.file_size_bytes)} •
          ${formatDateTime(documentRow.uploaded_at)}
        </div>
      </div>

      <!-- EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H FIX
           Saved document buttons are wired through one delegated click handler
           in bindEvents(), so they still work after the list re-renders. -->
      <div class="d-inline-flex align-items-center gap-2 flex-wrap">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-open-document-id="${escapeHtml(documentRow.id)}"
        >
          Open
        </button>

        <button
          type="button"
          class="btn btn-sm btn-outline-danger"
          data-remove-document-id="${escapeHtml(documentRow.id)}"
        >
          <i class="bi bi-trash me-1"></i>Remove
        </button>
      </div>
    `;

    list.appendChild(item);
  });
}

async function openEmployeeDocument(documentId) {
  const documentKey = String(documentId || "").trim();

  if (!documentKey) {
    showPageAlert("warning", "The selected document could not be resolved.");
    return;
  }

  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H FIX
  // Open a blank tab immediately during the user click.
  // This avoids browser popup blocking while Supabase creates the signed URL.
  const documentWindow = window.open("about:blank", "_blank");

  try {
    const supabase = getSupabaseClient();

    const documentRow = state.attachedDocuments.find(
      (item) => String(item.id) === documentKey,
    );

    if (!documentRow?.file_path) {
      throw new Error("The selected document could not be resolved.");
    }

    if (documentWindow) {
      documentWindow.document.write("Opening document...");
      documentWindow.opener = null;
    }

    const { data, error } = await supabase.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .createSignedUrl(documentRow.file_path, 60);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("A secure document link could not be generated.");
    }

    if (documentWindow) {
      documentWindow.location.href = data.signedUrl;
    } else {
      window.open(data.signedUrl, "_blank");
    }
  } catch (error) {
    if (documentWindow) {
      documentWindow.close();
    }

    console.error("Error opening employee document:", error);
    showPageAlert(
      "warning",
      error.message || "The selected document could not be opened.",
    );
  }
}

// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H RECOVERY
// Removes a saved employee document after confirmation.
// This version verifies that the employee_documents row was actually deleted
// before showing success, so HR does not get a false success message.
async function removeEmployeeDocument(documentId) {
  const documentKey = String(documentId || "").trim();

  if (!documentKey) {
    showPageAlert("warning", "The selected document could not be resolved.");
    return;
  }

  const documentRow = state.attachedDocuments.find(
    (item) => String(item.id) === documentKey,
  );

  if (!documentRow) {
    showPageAlert(
      "warning",
      "The selected document could not be found. Please refresh the employee record and try again.",
    );
    return;
  }

  const fileName = documentRow.file_name || "this document";

  const confirmed = window.confirm(
    `Remove "${fileName}" from this employee record? This action cannot be undone.`,
  );

  if (!confirmed) return;

  try {
    clearPageAlert();

    const supabase = getSupabaseClient();
    const filePath = String(documentRow.file_path || "").trim();

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H RECOVERY
    // Delete the metadata row first and request the deleted row back.
    // If RLS or permissions block the delete, Supabase may return no deleted row
    // without throwing an error, so we must check the returned data.
    const { data: deletedRows, error: deleteError } = await supabase
      .from("employee_documents")
      .delete()
      .eq("id", documentKey)
      .select("id");

    if (deleteError) throw deleteError;

    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      throw new Error(
        "The document record was not removed. Please check employee_documents delete permission/RLS and try again.",
      );
    }

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H RECOVERY
    // After the metadata row is confirmed deleted, remove the storage file.
    // If the storage file is already missing, the saved document should still
    // disappear because the employee_documents row has been removed.
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from(EMPLOYEE_DOCUMENTS_BUCKET)
        .remove([filePath]);

      if (storageError) {
        console.warn("Stored employee document file could not be removed:", storageError);
      }
    }

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1H RECOVERY
    // Update the current screen immediately before reloading from Supabase.
    state.attachedDocuments = state.attachedDocuments.filter(
      (item) => String(item.id) !== documentKey,
    );
    renderAttachedDocuments();

    const employeeId = String(
      documentRow.employee_id || state.currentEditingEmployee?.id || "",
    ).trim();

    if (employeeId) {
      await loadEmployeeDocuments(employeeId);
    }

    await loadAllEmployeeDocuments();

    showPageAlert(
      "success",
      `Document <strong>${escapeHtml(fileName)}</strong> was removed successfully.`,
    );
  } catch (error) {
    console.error("Error removing employee document:", error);
    showPageAlert(
      "danger",
      error.message || "Employee document could not be removed.",
    );
  }
}

async function uploadPendingFilesForEmployee(employeeId) {
  if (!state.pendingFiles.length) {
    await loadEmployeeDocuments(employeeId);
    await loadAllEmployeeDocuments();
    return;
  }

  const supabase = getSupabaseClient();
  const uploadedMetadataRows = [];

  for (const pendingItem of state.pendingFiles) {
    const file = pendingItem?.file || pendingItem;
    const documentType = String(pendingItem?.documentType || "").trim() || null;

    const safeName = sanitizeFileName(file.name);
    const storagePath = `${employeeId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(
        `Document upload failed for ${file.name}: ${uploadError.message}`,
      );
    }

    uploadedMetadataRows.push({
      employee_id: employeeId,

      // DESCRIPTION ITEM 10 - STEP 2
      // Persist the chosen HR document classification with each file.
      document_type: documentType,

      file_name: file.name,
      file_path: storagePath,
      mime_type: file.type || null,
      file_size_bytes: file.size || null,
      uploaded_by: state.currentUser?.id || null,
    });
  }

  if (uploadedMetadataRows.length) {
    const { error: metadataInsertError } = await supabase
      .from("employee_documents")
      .insert(uploadedMetadataRows);

    if (metadataInsertError) {
      throw new Error(
        `Document metadata could not be saved: ${metadataInsertError.message}`,
      );
    }
  }

  state.pendingFiles = [];

  if (state.dom.employeeDocumentsInput) {
    state.dom.employeeDocumentsInput.value = "";
  }

  if (state.dom.employeeDocumentType) {
    state.dom.employeeDocumentType.value = "";
  }

  renderPendingFiles();

  await loadEmployeeDocuments(employeeId);
  await loadAllEmployeeDocuments();
  renderAttachedDocuments();
}

async function handleEmployeeSave() {
  clearPageAlert();

  if (!validateEmployeeForm()) {
    showPageAlert(
      "warning",
      "Please complete all required employee fields before saving.",
    );
    return;
  }

  const employeePayload = buildEmployeePayload();
  const editingId = String(state.dom.editingEmployeeId?.value || "").trim();
  const isEditMode = Boolean(editingId);

  try {
    setEmployeeSaveLoading(true, isEditMode);

    const duplicateEmployee = await checkDuplicateEmployee(
      employeePayload.work_email,
      isEditMode ? editingId : null,
    );

    if (duplicateEmployee) {
      showPageAlert(
        "warning",
        `An employee record already exists for <strong>${escapeHtml(
          employeePayload.work_email,
        )}</strong>.`,
      );
      return;
    }

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
    // Only create mode generates a new Employee Number.
    // Edit mode must preserve the existing Employee Number.
    if (!isEditMode) {
      employeePayload.employee_number = await generateNextEmployeeCustomId();

      if (state.dom.employeeNumber) {
        state.dom.employeeNumber.value = employeePayload.employee_number;
      }
    }

    const supabase = getSupabaseClient();
    let savedEmployeeId = editingId;
// EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1C
// Build the success-message name with optional Middle Name.
let savedEmployeeName = [
  employeePayload.first_name,
  employeePayload.middle_name,
  employeePayload.last_name,
]
  .map((namePart) => String(namePart || "").trim())
  .filter(Boolean)
  .join(" ");
    let savedEmployeeNumber = String(employeePayload.employee_number || "").trim();

    if (isEditMode) {
      const { data, error } = await supabase
        .from("employees")
        .update(employeePayload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        throw new Error("Employee update did not return the updated record.");
      }

      savedEmployeeId = data.id;
savedEmployeeName = [
  data.first_name || employeePayload.first_name,
  data.middle_name || employeePayload.middle_name,
  data.last_name || employeePayload.last_name,
]
  .map((namePart) => String(namePart || "").trim())
  .filter(Boolean)
  .join(" ");

      // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
      // Keep the returned employee number available for messaging.
      savedEmployeeNumber = String(
        data.employee_number || employeePayload.employee_number || "",
      ).trim();
    } else {
      const { data, error } = await supabase
        .from("employees")
        .insert(employeePayload)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        throw new Error("Employee create did not return the new record.");
      }

      savedEmployeeId = data.id;
      savedEmployeeName =
        `${data.first_name || employeePayload.first_name} ${data.last_name || employeePayload.last_name}`.trim();

      // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
      // Capture the generated custom ID after create.
      savedEmployeeNumber = String(
        data.employee_number || employeePayload.employee_number || "",
      ).trim();
    }

    if (state.pendingFiles.length) {
      await uploadPendingFilesForEmployee(savedEmployeeId);
    } else {
      await loadEmployeeDocuments(savedEmployeeId);
      renderAttachedDocuments();
    }

    await loadAllEmployeeDocuments();
    await loadAuthProfilesForLinkage();
    await loadEmployees();

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
    // Keep payroll-related employee dropdowns aligned after employee create/update.
    populatePayrollEmployeeOptions();
    populatePayrollMasterEmployeeOptions();
    renderPayrollSelectedEmployeeReference(
      state.dom.payrollEmployeeId?.value || "",
    );

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
    // Show the generated Employee ID only after a new employee is created.
    // Edit mode should not suggest that the Employee ID was regenerated.
    const employeeSaveSuccessMessage = isEditMode
      ? `Employee profile for <strong>${escapeHtml(
          savedEmployeeName,
        )}</strong> was updated successfully.`
      : `Employee profile for <strong>${escapeHtml(
          savedEmployeeName,
        )}</strong> was created successfully with Employee ID <strong>${escapeHtml(
          savedEmployeeNumber || employeePayload.employee_number || "--",
        )}</strong>.`;

    showPageAlert("success", employeeSaveSuccessMessage);

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1A
    // After create/update, clear the form and return HR to the employee list.
    resetEmployeeForm();
    redirectToFullEmployeeListAfterEmployeeSave();
  } catch (error) {
    console.error("Error saving employee profile:", error);

    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1O
    // The database now protects Employee Number from duplicates.
    // If a rare duplicate happens, show HR a clear message instead of
    // exposing a raw Supabase duplicate-key error.
    const errorMessage = String(error.message || "").toLowerCase();

    const isDuplicateEmployeeNumber =
      errorMessage.includes("uq_employees_employee_number_normalised") ||
      (
        errorMessage.includes("duplicate key value") &&
        errorMessage.includes("employee_number")
      );

    if (isDuplicateEmployeeNumber && !isEditMode) {
      if (state.dom.employeeNumber) {
        state.dom.employeeNumber.value = "";
      }

      await refreshEmployeeWorkspace();

      showPageAlert(
        "warning",
        "The generated Employee Number was already taken. Please click Create Employee Profile again so the system can generate the next available number.",
      );

      return;
    }

    showPageAlert(
      "danger",
      error.message || "Employee profile could not be saved.",
    );
  } finally {
    setEmployeeSaveLoading(false, isEditMode);
  }
}
function setEmployeeSaveLoading(isLoading, isEditMode = false) {
  const button = state.dom.saveEmployeeBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${isEditMode ? "Updating Employee..." : "Saving Employee..."}
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.saveEmployeeBtnText = document.getElementById("saveEmployeeBtnText");
  }
}

/* =========================================================
   Payroll workspace
========================================================= */
async function refreshPayrollWorkspace() {
  renderPayrollRecordsLoadingState();
  await loadPayrollRecords();
  populatePayrollEmployeeOptions();
}

async function loadPayrollRecords() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("hr_payroll_overview")
      .select("*")
      .order("pay_date", { ascending: false });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    rows.sort((a, b) => {
      const aUpdated = new Date(a.updated_at || a.created_at || a.pay_date || 0).getTime();
      const bUpdated = new Date(b.updated_at || b.created_at || b.pay_date || 0).getTime();

      if (bUpdated !== aUpdated) {
        return bUpdated - aUpdated;
      }

      const aPayDate = new Date(a.pay_date || 0).getTime();
      const bPayDate = new Date(b.pay_date || 0).getTime();

      return bPayDate - aPayDate;
    });

    state.payrollRecords = rows;

    // PAYROLL EXPORT - DESCRIPTION ITEM 3 - STEP 4B
    // Keep export pay cycle options in sync whenever Payroll Records reload.
    populateExportPayrollPayCycleOptions(rows);

    applyPayrollSearch();
  } catch (error) {
    console.error("Error loading payroll records:", error);
    showPageAlert(
      "danger",
      error.message || "Payroll records could not be loaded.",
    );
    state.payrollRecords = [];
    state.filteredPayrollRecords = [];
    renderPayrollSummary([]);
    renderPayrollRecords([]);

    // DESCRIPTION ITEM 4 - STEP 3
    // Keep Send Payslips disabled if payroll records fail to load.
    updateSendPayslipsButtonState();
  }
}

// PAYROLL BANK READINESS - STEP 11B
// Reset the Payment Bank Details panel to a neutral state.
// This is used when no employee is selected or when the payroll form is cleared.
function resetPayrollBankReadinessPanel(message = "Select an employee to check payment bank details before payroll submission.") {
  if (state.dom.payrollBankReadinessBadge) {
    state.dom.payrollBankReadinessBadge.textContent = "Not checked";
    state.dom.payrollBankReadinessBadge.className =
      "badge rounded-pill text-bg-secondary";
  }

  if (state.dom.payrollBankReadinessEmptyState) {
    state.dom.payrollBankReadinessEmptyState.textContent = message;
    state.dom.payrollBankReadinessEmptyState.classList.remove("d-none");
  }

  state.dom.payrollBankReadinessDetails?.classList.add("d-none");
  state.dom.payrollBankReadinessWarning?.classList.add("d-none");

  // PAYROLL BANK READINESS - STEP 11C
  // Hide the submit warning when no employee is selected or the form is reset.
  state.dom.payrollBankReadinessSubmitWarning?.classList.add("d-none");

  if (state.dom.payrollBankReadinessBankName) {
    state.dom.payrollBankReadinessBankName.textContent = "--";
  }

  if (state.dom.payrollBankReadinessBankCode) {
    state.dom.payrollBankReadinessBankCode.textContent = "--";
  }

  if (state.dom.payrollBankReadinessAccountNumber) {
    state.dom.payrollBankReadinessAccountNumber.textContent = "--";
  }

  if (state.dom.payrollBankReadinessAccountName) {
    state.dom.payrollBankReadinessAccountName.textContent = "--";
  }
}

// PAYROLL BANK READINESS - STEP 11B
// Find the selected employee's active bank details from the records already
// loaded into state.employeeBankDetailsRecords.
function getActiveEmployeeBankDetailsForPayrollReadiness(employeeId) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return null;

  return (
    (state.employeeBankDetailsRecords || []).find(
      (record) =>
        String(record.employee_id || "").trim() === employeeKey &&
        normalizeText(record.status) === "active",
    ) || null
  );
}

// PAYROLL BANK READINESS - STEP 11D
// Resolve readable employee names for finalisation-blocking messages.
function getEmployeeDisplayNameById(employeeId) {
  const employeeKey = String(employeeId || "").trim();

  const employee = (state.employees || []).find(
    (item) => String(item.id || "").trim() === employeeKey,
  );

  if (!employee) return "Unknown Employee";

  return (
    `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
    employee.work_email ||
    employee.employee_number ||
    "Unknown Employee"
  );
}

// PAYROLL BANK READINESS - STEP 11D
// Return employees that do not have active payment bank details.
// This is used only when payroll is being marked as finalised.
function getEmployeesMissingActiveBankDetails(employeeIds = []) {
  return employeeIds
    .map((employeeId) => String(employeeId || "").trim())
    .filter(Boolean)
    .filter(
      (employeeId) =>
        !getActiveEmployeeBankDetailsForPayrollReadiness(employeeId),
    );
}

// PAYROLL BANK READINESS - STEP 11D
// Finalisation rule:
// Payroll can be prepared without bank details,
// but it cannot be marked as finalised/payment-ready without active bank details.
function validatePayrollFinalisationBankReadiness(employeeIds = []) {
  const isBeingFinalised = Boolean(state.dom.payrollIsFinalised?.checked);

  if (!isBeingFinalised) {
    return true;
  }

  const missingBankEmployeeIds =
    getEmployeesMissingActiveBankDetails(employeeIds);

  if (!missingBankEmployeeIds.length) {
    return true;
  }

  const missingEmployeeNames = missingBankEmployeeIds
    .slice(0, 5)
    .map((employeeId) => getEmployeeDisplayNameById(employeeId));

  const extraCount = missingBankEmployeeIds.length - missingEmployeeNames.length;

  showPageAlert(
    "warning",
    `Payroll cannot be finalised because ${missingBankEmployeeIds.length} employee(s) do not have active payment bank details. Affected: <strong>${escapeHtml(
      missingEmployeeNames.join(", "),
    )}${extraCount > 0 ? `, and ${extraCount} more` : ""}</strong>. Save active employee bank details first, or untick Mark as Finalised to save the payroll as non-finalised.`,
  );

  return false;
}

// PAYROLL BANK READINESS - STEP 11B
// Render bank readiness for the selected payroll employee.
// This is advisory only at this stage; payroll submission is not blocked yet.
function renderPayrollBankReadiness(employeeId) {
  const employeeKey = String(employeeId || "").trim();

  if (!employeeKey) {
    resetPayrollBankReadinessPanel(
      "Select an employee to check payment bank details before payroll submission.",
    );
    return;
  }

  const activeBankDetails =
    getActiveEmployeeBankDetailsForPayrollReadiness(employeeKey);

  if (!activeBankDetails) {
    if (state.dom.payrollBankReadinessBadge) {
      state.dom.payrollBankReadinessBadge.textContent = "Bank details missing";
      state.dom.payrollBankReadinessBadge.className =
        "badge rounded-pill text-bg-warning";
    }

    state.dom.payrollBankReadinessEmptyState?.classList.add("d-none");
    state.dom.payrollBankReadinessDetails?.classList.add("d-none");
    state.dom.payrollBankReadinessWarning?.classList.remove("d-none");

    // PAYROLL BANK READINESS - STEP 11C
    // Show a clear soft warning near Submit Payroll.
    // This is advisory only; it does not block payroll submission.
    state.dom.payrollBankReadinessSubmitWarning?.classList.remove("d-none");

    return;
  }

  if (state.dom.payrollBankReadinessBadge) {
    state.dom.payrollBankReadinessBadge.textContent = "Ready for payment";
    state.dom.payrollBankReadinessBadge.className =
      "badge rounded-pill text-bg-success";
  }

  state.dom.payrollBankReadinessEmptyState?.classList.add("d-none");
  state.dom.payrollBankReadinessWarning?.classList.add("d-none");
  state.dom.payrollBankReadinessDetails?.classList.remove("d-none");

  // PAYROLL BANK READINESS - STEP 11C
  // Hide the Submit Payroll warning when active bank details exist.
  state.dom.payrollBankReadinessSubmitWarning?.classList.add("d-none");

  if (state.dom.payrollBankReadinessBankName) {
    state.dom.payrollBankReadinessBankName.textContent =
      activeBankDetails.bank_name || "--";
  }

  if (state.dom.payrollBankReadinessBankCode) {
    state.dom.payrollBankReadinessBankCode.textContent =
      activeBankDetails.bank_code || "--";
  }

  if (state.dom.payrollBankReadinessAccountNumber) {
    state.dom.payrollBankReadinessAccountNumber.textContent =
      activeBankDetails.account_number || "--";
  }

  if (state.dom.payrollBankReadinessAccountName) {
    state.dom.payrollBankReadinessAccountName.textContent =
      activeBankDetails.account_name || "--";
  }
}

// DESCRIPTION ITEM 2 - STEP 1
// Render the selected employee's HR-owned details inside the payroll form.
// This keeps payroll as a consumer of HR employee data rather than a separate owner.
function renderPayrollSelectedEmployeeReference(employeeId = "") {
  const resolvedEmployeeId =
    String(employeeId || state.dom.payrollEmployeeId?.value || "").trim();

  const emptyState = state.dom.payrollSelectedEmployeeReferenceEmptyState;
  const details = state.dom.payrollSelectedEmployeeReferenceDetails;

  const employee = state.employees.find(
    (item) => String(item.id || "").trim() === resolvedEmployeeId,
  );

  if (!employee) {
    if (emptyState) {
      emptyState.classList.remove("d-none");
    }

    if (details) {
      details.classList.add("d-none");
    }

    if (state.dom.payrollSelectedEmployeeNumber) {
      state.dom.payrollSelectedEmployeeNumber.textContent = "--";
    }
    if (state.dom.payrollSelectedEmployeeEmail) {
      state.dom.payrollSelectedEmployeeEmail.textContent = "--";
    }
    if (state.dom.payrollSelectedEmployeeDepartment) {
      state.dom.payrollSelectedEmployeeDepartment.textContent = "--";
    }
    if (state.dom.payrollSelectedEmployeeJobTitle) {
      state.dom.payrollSelectedEmployeeJobTitle.textContent = "--";
    }
    if (state.dom.payrollSelectedEmployeeStatus) {
      state.dom.payrollSelectedEmployeeStatus.textContent = "--";
    }

    // PAYROLL BANK READINESS - STEP 11B
    // No employee is selected, so return the bank readiness panel
    // to its neutral state.
    renderPayrollBankReadiness("");

    return;
  }

  if (emptyState) {
    emptyState.classList.add("d-none");
  }

  if (details) {
    details.classList.remove("d-none");
  }

  if (state.dom.payrollSelectedEmployeeNumber) {
    state.dom.payrollSelectedEmployeeNumber.textContent =
      employee.employee_number || "--";
  }

  if (state.dom.payrollSelectedEmployeeEmail) {
    state.dom.payrollSelectedEmployeeEmail.textContent =
      employee.work_email || "--";
  }

  if (state.dom.payrollSelectedEmployeeDepartment) {
    state.dom.payrollSelectedEmployeeDepartment.textContent =
      employee.department || "--";
  }

  if (state.dom.payrollSelectedEmployeeJobTitle) {
    state.dom.payrollSelectedEmployeeJobTitle.textContent =
      employee.job_title || "--";
  }

  if (state.dom.payrollSelectedEmployeeStatus) {
    state.dom.payrollSelectedEmployeeStatus.textContent =
      formatStatusLabel(employee.status) || "--";
  }

  // PAYROLL BANK READINESS - STEP 11B
  // After employee reference details are shown, check whether this employee
  // has active saved bank details for payroll payment readiness.
  renderPayrollBankReadiness(employee.id);
}

// EMPLOYEE BANK DETAILS - STEP 6
// Keep Save disabled until all required Employee Bank Details fields are populated.
// Bank code is included because it confirms a real Bank Directory record was selected.
// HR BUTTON UNIFORMITY - STEP 6B
// Employee Bank Details uses the same grey/blue action behaviour
// as every other HR payroll form.
function updateEmployeeBankDetailsSaveButtonState() {
  const hasEmployee = Boolean(String(state.dom.employeeBankEmployeeId?.value || "").trim());
  const hasBank = Boolean(String(state.dom.employeeBankBankId?.value || "").trim());
  const hasBankCode = Boolean(String(state.dom.employeeBankCode?.value || "").trim());
  const hasAccountNumber = Boolean(String(state.dom.employeeBankAccountNumber?.value || "").trim());
  const hasAccountName = Boolean(String(state.dom.employeeBankAccountName?.value || "").trim());
  const hasStatus = Boolean(String(state.dom.employeeBankStatus?.value || "").trim());

  setPrimaryActionButtonReadyState(
    state.dom.saveEmployeeBankDetailsBtn,
    hasEmployee &&
    hasBank &&
    hasBankCode &&
    hasAccountNumber &&
    hasAccountName &&
    hasStatus,
  );
}

// HR BUTTON UNIFORMITY - STEP 6B
// Payroll Master Data button state.
// Required fields match validatePayrollMasterForm().
function updatePayrollMasterSaveButtonState() {
  // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1J
  // Grade removed from Payroll Master readiness.
  // Payroll Master can save when employee, salary, effective date,
  // pay cycle, and status are complete.
  const hasEmployee = Boolean(String(state.dom.payrollMasterEmployeeId?.value || "").trim());
  const hasSalary = Boolean(String(state.dom.payrollMasterBasicSalary?.value || "").trim());
  const hasEffectiveDate = Boolean(String(state.dom.payrollMasterEffectiveDate?.value || "").trim());
  const hasPayCycle = Boolean(String(state.dom.payrollMasterPayCycle?.value || "").trim());
  const hasStatus = Boolean(String(state.dom.payrollMasterStatus?.value || "").trim());

  const salaryValue = Number(state.dom.payrollMasterBasicSalary?.value || 0);
  const salaryIsValid = Number.isFinite(salaryValue) && salaryValue >= 0;

  setPrimaryActionButtonReadyState(
    state.dom.savePayrollMasterBtn,
    hasEmployee &&
    hasSalary &&
    salaryIsValid &&
    hasEffectiveDate &&
    hasPayCycle &&
    hasStatus,
  );
}

// HR BUTTON UNIFORMITY - STEP 6B
// Allowance Components button state.
// Required fields match validatePayrollAllowanceForm().
function updatePayrollAllowanceSaveButtonState() {
  const hasMasterRecord = Boolean(String(state.dom.payrollAllowanceMasterRecordId?.value || "").trim());
  const hasType = Boolean(String(state.dom.payrollAllowanceType?.value || "").trim());
  const hasAmount = Boolean(String(state.dom.payrollAllowanceAmount?.value || "").trim());
  const hasEffectiveDate = Boolean(String(state.dom.payrollAllowanceEffectiveDate?.value || "").trim());
  const hasStatus = Boolean(String(state.dom.payrollAllowanceStatus?.value || "").trim());

  const amountValue = Number(state.dom.payrollAllowanceAmount?.value || 0);
  const amountIsValid = Number.isFinite(amountValue) && amountValue >= 0;

  setPrimaryActionButtonReadyState(
    state.dom.savePayrollAllowanceBtn,
    hasMasterRecord &&
    hasType &&
    hasAmount &&
    amountIsValid &&
    hasEffectiveDate &&
    hasStatus,
  );
}
// SUBMIT PAYROLL - REPAIR STEP
// Keep Submit Payroll disabled until the payroll has a real positive amount.
// The previous check treated auto-calculated 0.00 values as complete,
// which made the button turn blue too early.
function updatePayrollSubmitButtonState() {
  const selectedBatchEmployeeIds = Array.from(
    state.selectedEmployeesForPayroll || [],
  ).filter(Boolean);

  const hasSingleEmployee = Boolean(
    String(state.dom.payrollEmployeeId?.value || "").trim(),
  );

  const hasBatchEmployees =
    selectedBatchEmployeeIds.length > 1 && !hasSingleEmployee;

  const hasPayCycle = Boolean(
    String(state.dom.payrollPayCycle?.value || "").trim(),
  );

  const hasPayDate = Boolean(
    String(state.dom.payrollPayDate?.value || "").trim(),
  );

  const grossPayValue = Number(state.dom.payrollGrossPay?.value || 0);
  const totalDeductionsValue = Number(state.dom.payrollTotalDeductions?.value || 0);
  const netPayValue = Number(state.dom.payrollNetPay?.value || 0);

  const hasValidGrossPay =
    Number.isFinite(grossPayValue) && grossPayValue > 0;

  const hasValidTotalDeductions =
    Number.isFinite(totalDeductionsValue) && totalDeductionsValue >= 0;

  // PAYROLL CALCULATION REPAIR - STEP 12A
  // Total deductions must not exceed gross pay.
  // This prevents negative Net Pay from being treated as submittable payroll.
  const deductionsDoNotExceedGross =
    hasValidGrossPay &&
    hasValidTotalDeductions &&
    totalDeductionsValue <= grossPayValue;

  const hasValidNetPay =
    Number.isFinite(netPayValue) && netPayValue > 0;

  const canSubmit =
    (hasSingleEmployee || hasBatchEmployees) &&
    hasPayCycle &&
    hasPayDate &&
    hasValidGrossPay &&
    hasValidTotalDeductions &&
    deductionsDoNotExceedGross &&
    hasValidNetPay;

  setPrimaryActionButtonReadyState(state.dom.savePayrollBtn, canSubmit);
  setPrimaryActionButtonReadyState(state.dom.topSubmitPayrollBtn, canSubmit);
}

// EMPLOYEE BANK DETAILS - STEP 7
// Validate the Employee Bank Details form before saving to Supabase.
function validateEmployeeBankDetailsForm() {
  let isValid = true;
  let firstInvalidField = null;

  const requiredFields = [
    state.dom.employeeBankEmployeeId,
    state.dom.employeeBankBankId,
    state.dom.employeeBankCode,
    state.dom.employeeBankAccountNumber,
    state.dom.employeeBankAccountName,
    state.dom.employeeBankStatus,
  ];

  requiredFields.forEach((field) => {
    const value = String(field?.value || "").trim();

    if (!value) {
      field?.classList.add("is-invalid");
      isValid = false;
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field?.classList.remove("is-invalid");
    }
  });

  if (!isValid && firstInvalidField?.focus) {
    firstInvalidField.focus();
  }

  return isValid;
}

// EMPLOYEE BANK DETAILS - STEP 7
// Build the Supabase payload using the employee, selected bank,
// copied bank code, account number, account name, and status.
function buildEmployeeBankDetailsPayload() {
  return {
    employee_id: String(state.dom.employeeBankEmployeeId?.value || "").trim(),
    bank_id: String(state.dom.employeeBankBankId?.value || "").trim(),
    bank_code: String(state.dom.employeeBankCode?.value || "").trim(),
    account_number: String(state.dom.employeeBankAccountNumber?.value || "").trim(),
    account_name: String(state.dom.employeeBankAccountName?.value || "").trim(),
    status: String(state.dom.employeeBankStatus?.value || "Active").trim(),
  };
}

// EMPLOYEE BANK DETAILS - STEP 7
// Show save feedback while Supabase insert is running.
function setEmployeeBankDetailsSaveLoading(isLoading) {
  const button = state.dom.saveEmployeeBankDetailsBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Saving Employee Bank Details...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.employeeBankDetailsSubmitLabel = document.getElementById(
      "employeeBankDetailsSubmitLabel",
    );
  }

  updateEmployeeBankDetailsSaveButtonState();
}

// EMPLOYEE BANK DETAILS - STEP 7
// Persist new employee bank details to Supabase.
// Edit/update will be added separately after create has been tested.
async function handleEmployeeBankDetailsSave() {
  clearPageAlert();

  if (!validateEmployeeBankDetailsForm()) {
    showPageAlert(
      "warning",
      "Please complete all required employee bank details before saving.",
    );
    return;
  }

  const payload = buildEmployeeBankDetailsPayload();
  const editingId = String(state.dom.editingEmployeeBankDetailsId?.value || "").trim();
  const isEditMode = Boolean(editingId);

  try {
    setEmployeeBankDetailsSaveLoading(true);

    const supabase = getSupabaseClient();

    // EMPLOYEE BANK DETAILS - STEP 9
    // Create a new employee bank record when no edit id exists.
    // Update the selected existing record when edit mode is active.
    const response = isEditMode
      ? await supabase
        .from("employee_bank_details")
        .update(payload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle()
      : await supabase
        .from("employee_bank_details")
        .insert([payload])
        .select("*")
        .maybeSingle();

    if (response.error) throw response.error;

    // HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
    // Remember the saved/updated employee bank record so it appears first
    // after refresh.
    state.lastSavedEmployeeBankDetailsKey = buildEmployeeBankDetailsSortKey({
      id: response.data?.id || editingId,
      employee_id: response.data?.employee_id || payload.employee_id,
      bank_id: response.data?.bank_id || payload.bank_id,
      account_number: response.data?.account_number || payload.account_number,
    });

    // HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
    // Clear search before refresh so the saved/updated row is visible.
    if (state.dom.employeeBankDetailsSearchInput) {
      state.dom.employeeBankDetailsSearchInput.value = "";
    }

    await refreshEmployeeBankDetailsWorkspace();

    showPageAlert(
      "success",
      isEditMode
        ? "Employee bank details were updated successfully."
        : "Employee bank details were saved successfully.",
    );

    resetEmployeeBankDetailsForm();

    setTimeout(() => {
      redirectToEmployeeBankDetailsRecordsAfterSave();
    }, 250);
  } catch (error) {
    console.error("Error saving employee bank details:", error);

    if (
      String(error.message || "").toLowerCase().includes("duplicate key value") ||
      String(error.message || "").toLowerCase().includes("employee_bank_details_unique_account")
    ) {
      showPageAlert(
        "warning",
        "This employee already has this bank account saved.",
      );
      return;
    }

    showPageAlert(
      "danger",
      error.message || "Employee bank details could not be saved.",
    );
  } finally {
    setEmployeeBankDetailsSaveLoading(false);
  }
}

// EMPLOYEE BANK DETAILS - STEP 8
// Show a temporary loading row while saved employee bank details
// are being loaded from Supabase.
function renderEmployeeBankDetailsLoadingState() {
  const tbody = state.dom.employeeBankDetailsTableBody;
  if (!tbody) return;

  state.dom.employeeBankDetailsEmptyState?.classList.add("d-none");
  state.dom.employeeBankDetailsTableWrapper?.classList.remove("d-none");

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-secondary py-4">
        Loading employee bank details.
      </td>
    </tr>
  `;
}

// EMPLOYEE BANK DETAILS - STEP 8
// Load employee bank details from Supabase and join employee/bank names
// for a readable HR records table.
async function refreshEmployeeBankDetailsWorkspace() {
  renderEmployeeBankDetailsLoadingState();

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("employee_bank_details")
      .select(`
        *,
        employees (
          id,
          first_name,
          last_name,
          work_email,
          employee_number
        ),
        bank_directory (
          id,
          bank_name,
          bank_code,
          status
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.employeeBankDetailsRecords = Array.isArray(data)
      ? data.map((record) => {
        const employee = record.employees || {};
        const bank = record.bank_directory || {};

        const employeeName =
          `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
          employee.work_email ||
          "Unknown Employee";

        return {
          ...record,
          employee_name: employeeName,
          employee_email: employee.work_email || "",
          employee_number: employee.employee_number || "",
          bank_name: bank.bank_name || "",
          bank_directory_status: bank.status || "",
        };
      })
      : [];

    applyEmployeeBankDetailsSearch();

    // PAYROLL BANK READINESS - STEP 11B
    // If HR is currently viewing a payroll employee, refresh the readiness
    // panel after employee bank details reload.
    renderPayrollBankReadiness(state.dom.payrollEmployeeId?.value || "");
  } catch (error) {
    console.error("Error loading employee bank details:", error);

    showPageAlert(
      "danger",
      error.message || "Employee bank details could not be loaded.",
    );

    state.employeeBankDetailsRecords = [];
    state.filteredEmployeeBankDetailsRecords = [];
    renderEmployeeBankDetailsTable([]);
  }
}

// EMPLOYEE BANK DETAILS - STEP 8
// Client-side search for employee name, email, bank, account number,
// account name, bank code, and status.
function applyEmployeeBankDetailsSearch() {
  const searchTerm = normalizeText(
    state.dom.employeeBankDetailsSearchInput?.value || "",
  );

  let rows = [...state.employeeBankDetailsRecords];

  if (searchTerm) {
    rows = rows.filter((record) => {
      const searchableText = [
        record.employee_name,
        record.employee_email,
        record.employee_number,
        record.bank_name,
        record.bank_code,
        record.account_number,
        record.account_name,
        record.status,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  state.filteredEmployeeBankDetailsRecords = rows;
  renderEmployeeBankDetailsTable(rows);
}

// EMPLOYEE BANK DETAILS - STEP 8
// Render saved employee bank details under the Employee Bank Records table.
// Edit action is intentionally disabled for now; edit mode comes next.
function renderEmployeeBankDetailsTable(records) {
  const tbody = state.dom.employeeBankDetailsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    state.dom.employeeBankDetailsEmptyState?.classList.remove("d-none");
    state.dom.employeeBankDetailsTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.employeeBankDetailsEmptyState?.classList.add("d-none");
  state.dom.employeeBankDetailsTableWrapper?.classList.remove("d-none");

  // HR SAVE/EDIT BEHAVIOUR - EMPLOYEE BANK DETAILS STEP 4
  // Render newest/most recently updated employee bank records first.
  const recordsToRender = sortEmployeeBankDetailsRecordsByLatestActivity(records);

  recordsToRender.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(record.employee_name || "Unknown Employee")}</div>
        <div class="text-secondary small text-break">
          ${escapeHtml(record.employee_email || record.employee_number || "--")}
        </div>
      </td>

      <td>${escapeHtml(record.bank_name || "--")}</td>

      <td>${escapeHtml(record.bank_code || "--")}</td>

      <td>${escapeHtml(record.account_number || "--")}</td>

      <td>${escapeHtml(record.account_name || "--")}</td>

      <td>
        <span class="badge ${getStatusBadgeClass(record.status)}">
          ${escapeHtml(formatStatusLabel(record.status))}
        </span>
      </td>

<td class="text-center">
  <!-- EMPLOYEE BANK DETAILS - STEP 9
       Enable edit so HR can update employee bank details from the table. -->
  <button
    type="button"
    class="btn btn-sm btn-outline-primary"
    title="Edit employee bank details"
    aria-label="Edit employee bank details"
    onclick="window.hrEditEmployeeBankDetailsRecord('${String(record.id).replaceAll("'", "\\'")}')"
  >
    <i class="bi bi-pencil-square"></i>
  </button>
</td>
    `;

    tbody.appendChild(row);
  });
}

// EMPLOYEE BANK DETAILS - STEP 5
// Reset only the Employee Bank Details form.
// This clears selected employee, selected bank, auto-filled bank code,
// account number, account name, status, and any validation styling.
function resetEmployeeBankDetailsForm() {
  if (state.dom.employeeBankDetailsForm) {
    state.dom.employeeBankDetailsForm.reset();
  }

  if (state.dom.editingEmployeeBankDetailsId) {
    state.dom.editingEmployeeBankDetailsId.value = "";
  }

  // EMPLOYEE BANK DETAILS - STEP 9
  // Leave edit mode when the form is cleared or after a successful update.
  state.currentEditingEmployeeBankDetails = null;

  if (state.dom.employeeBankCode) {
    state.dom.employeeBankCode.value = "";
  }

  if (state.dom.employeeBankStatus) {
    state.dom.employeeBankStatus.value = "Active";
  }


  // EMPLOYEE BANK DETAILS - STEP 6
  // Recalculate button state after clearing the form.
  // This keeps Save disabled after Cancel.
  updateEmployeeBankDetailsSaveButtonState();

  if (state.dom.employeeBankDetailsSubmitLabel) {
    state.dom.employeeBankDetailsSubmitLabel.textContent = "Save Employee Bank Details";
  }

  // EMPLOYEE BANK DETAILS - STEP 9
  // Return the submit button wording to create/save mode after reset.
  if (state.dom.saveEmployeeBankDetailsBtn) {
    state.dom.saveEmployeeBankDetailsBtn.innerHTML = `
    <i class="bi bi-save me-2"></i>
    <span id="employeeBankDetailsSubmitLabel">Save Employee Bank Details</span>
  `;

    state.dom.employeeBankDetailsSubmitLabel = document.getElementById(
      "employeeBankDetailsSubmitLabel",
    );
  }
}

// EMPLOYEE BANK DETAILS - STEP 9 RECOVERY
// Restore the safe Employee Bank Details edit flow.
// This loads the selected bank details into the form and keeps the wider UI stable.
function startEmployeeBankDetailsEdit(employeeBankDetailsId) {
  const record = state.employeeBankDetailsRecords.find(
    (item) => String(item.id) === String(employeeBankDetailsId),
  );

  if (!record) {
    showPageAlert(
      "warning",
      "The selected employee bank details record could not be found. Please refresh and try again.",
    );
    return;
  }

  clearPageAlert();

  state.currentEditingEmployeeBankDetails = record;

  if (state.dom.editingEmployeeBankDetailsId) {
    state.dom.editingEmployeeBankDetailsId.value = record.id || "";
  }

  if (state.dom.employeeBankEmployeeId) {
    state.dom.employeeBankEmployeeId.value = record.employee_id || "";
  }

  if (state.dom.employeeBankBankId) {
    state.dom.employeeBankBankId.value = record.bank_id || "";
  }

  if (state.dom.employeeBankCode) {
    state.dom.employeeBankCode.value = record.bank_code || "";
  }

  if (state.dom.employeeBankAccountNumber) {
    state.dom.employeeBankAccountNumber.value = record.account_number || "";
  }

  if (state.dom.employeeBankAccountName) {
    state.dom.employeeBankAccountName.value = record.account_name || "";
  }

  if (state.dom.employeeBankStatus) {
    state.dom.employeeBankStatus.value = record.status || "Active";
  }

  if (state.dom.saveEmployeeBankDetailsBtn) {
    state.dom.saveEmployeeBankDetailsBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="employeeBankDetailsSubmitLabel">Update Employee Bank Details</span>
    `;

    state.dom.employeeBankDetailsSubmitLabel = document.getElementById(
      "employeeBankDetailsSubmitLabel",
    );
  }

  updateEmployeeBankDetailsSaveButtonState();

  // EMPLOYEE BANK DETAILS - STEP 9A LANDING FIX
  // Editing must reopen Employee Bank Details even if HR collapsed it.
  // Scroll to the Employee Bank Details card itself, not the inner form.
  // This prevents the page from landing too low or appearing to cut the card heading.
  openEmployeeBankDetailsCard();

  showPageAlert(
    "info",
    "Editing employee bank details. Make your changes and click Update Employee Bank Details.",
  );

  // EMPLOYEE BANK DETAILS - STEP 9A LANDING FIX
  // Wait for the alert/card expansion to finish painting before scrolling.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const employeeBankDetailsCard =
        state.dom.toggleEmployeeBankDetailsCardBtn?.closest(".dashboard-section-card") ||
        state.dom.employeeBankDetailsCardCollapse?.closest(".dashboard-section-card") ||
        state.dom.employeeBankDetailsCardCollapse ||
        state.dom.employeeBankDetailsForm;

      scrollToDashboardTarget(employeeBankDetailsCard, 16);
    });
  });
}
// Editing must reopen Employee Bank Details even if HR collapsed it.

// EMPLOYEE BANK DETAILS - STEP 4
// Populate Employee Bank Details employee dropdown from loaded HR employees.
function populateEmployeeBankEmployeeOptions() {
  const select = state.dom.employeeBankEmployeeId;
  if (!select) return;

  const currentValue = select.value;

  const employees = [...state.employees].sort((a, b) => {
    const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
    const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  select.innerHTML = `<option value="">Select employee</option>`;

  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.work_email ||
      "Unnamed Employee";

    select.appendChild(option);
  });

  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );

    if (stillExists) {
      select.value = currentValue;
    }
  }
}

// EMPLOYEE BANK DETAILS - STEP 4
// Populate Employee Bank Details bank dropdown from active Bank Directory records.
function populateEmployeeBankBankOptions() {
  const select = state.dom.employeeBankBankId;
  if (!select) return;

  const currentValue = select.value;

  const activeBanks = [...state.bankDirectoryRecords]
    .filter((bank) => normalizeText(bank.status) === "active")
    .sort((a, b) =>
      String(a.bank_name || "").localeCompare(String(b.bank_name || "")),
    );

  select.innerHTML = `<option value="">Select bank from Bank Directory</option>`;

  if (!activeBanks.length) {
    select.innerHTML = `<option value="">Add active banks in Bank Directory first</option>`;

    if (state.dom.employeeBankCode) {
      state.dom.employeeBankCode.value = "";
    }

    return;
  }

  activeBanks.forEach((bank) => {
    const option = document.createElement("option");
    option.value = bank.id;
    option.textContent = bank.bank_name || "Unnamed Bank";
    option.dataset.bankCode = bank.bank_code || "";

    select.appendChild(option);
  });

  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );

    if (stillExists) {
      select.value = currentValue;

      const selectedOption = select.selectedOptions?.[0];
      if (state.dom.employeeBankCode) {
        state.dom.employeeBankCode.value = selectedOption?.dataset?.bankCode || "";
      }
    }
  }
}

function populatePayrollEmployeeOptions() {
  const select = state.dom.payrollEmployeeId;
  if (!select) return;

  const currentValue = select.value;
  const employees = [...state.employees].sort((a, b) => {
    const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
    const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  select.innerHTML = `<option value="">Select employee</option>`;

  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.work_email ||
      "Unnamed Employee";
    option.dataset.department = employee.department || "";
    option.dataset.jobTitle = employee.job_title || "";
    select.appendChild(option);
  });

  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );
    if (stillExists) {
      select.value = currentValue;
    }
  }
}
// =========================================================
// DESCRIPTION ITEM 1
// Load payroll master records from Supabase for the new
// payroll master maintenance section.
// =========================================================
async function loadPayrollMasterRecords() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("payroll_master_records")
      .select(`
        *,
        employees (
          id,
          first_name,
          last_name,
          work_email
        )
      `)
      .order("salary_effective_date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const rows = Array.isArray(data)
      ? data.map((record) => ({
        ...record,
        first_name: record.employees?.first_name || "",
        last_name: record.employees?.last_name || "",
        work_email: record.employees?.work_email || "",
      }))
      : [];

    state.payrollMasterRecords = rows;
    applyPayrollMasterSearch();

    // DESCRIPTION ITEM 5 - SYNC FOUNDATION STEP 3C
    // Re-render the Full Employee List after payroll master data reloads so
    // grade fallback from payroll master is reflected immediately in HR.
    if (state.dom.employeeRecordsTableBody) {
      applyEmployeeSearch();
    }
  } catch (error) {
    console.error("Error loading payroll master records:", error);
    showPageAlert(
      "danger",
      error.message || "Payroll master records could not be loaded.",
    );

    state.payrollMasterRecords = [];
    state.filteredPayrollMasterRecords = [];
    renderPayrollMasterRecords([]);
  }
}
// =========================================================
// DESCRIPTION ITEM 1
// Populate employee options for Payroll Master Data form
// This reuses the current employee list already loaded for HR.
// =========================================================
function populatePayrollMasterEmployeeOptions() {
  const select = state.dom.payrollMasterEmployeeId;
  if (!select) return;

  const currentValue = select.value;

  const employees = [...state.employees].sort((a, b) => {
    const nameA = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
    const nameB = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Reset the dropdown before rebuilding it.
  select.innerHTML = `<option value="">Select employee</option>`;

  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      employee.work_email ||
      "Unnamed Employee";
    select.appendChild(option);
  });

  // Preserve existing selected value if the employee still exists.
  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );

    if (stillExists) {
      select.value = currentValue;
    }
  }
}

// DESCRIPTION ITEM 4 - STEP 3A
// Payroll Records filtering now respects:
// - free-text search
// - status filter
// - payroll action cycle
// This ensures the list shown matches the payroll run HR is about to export
// or send payslips for.
function applyPayrollSearch() {
  const searchTerm = normalizeText(state.dom.payrollSearchInput?.value || "");
  const statusFilter = normalizeText(state.dom.payrollStatusFilter?.value || "");
  const actionCycleFilter = String(state.dom.exportPayrollPayCycle?.value || "").trim();

  let rows = [...state.payrollRecords];

  if (actionCycleFilter) {
    rows = rows.filter(
      (record) => String(record.pay_cycle || "").trim() === actionCycleFilter,
    );
  }

  if (searchTerm) {
    rows = rows.filter((record) => {
      const searchableText = [
        record.first_name,
        record.last_name,
        record.work_email,
        record.department,
        record.job_title,
        record.employee_group,
        record.pay_cycle,
        record.status,
        record.payroll_reference,
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  if (statusFilter) {
    rows = rows.filter(
      (record) => normalizeText(record.status) === statusFilter,
    );
  }

  state.filteredPayrollRecords = rows;
  renderPayrollSummary(rows);
  renderPayrollRecords(rows);

  // DESCRIPTION ITEM 4 - STEP 3A
  // Keep Send Payslips button state aligned with the currently selected
  // payroll action cycle after every table filter refresh.
  updateSendPayslipsButtonState();
}

// PAYROLL EXPORT - DESCRIPTION ITEM 3 - STEP 4B
// Populate the export pay cycle dropdown from available finalised payroll records.
// This lets HR export a specific payroll period instead of always exporting all records.
function populateExportPayrollPayCycleOptions(records = []) {
  const select = state.dom.exportPayrollPayCycle;
  if (!select) return;

  const currentValue = select.value;

  const payCycles = Array.from(
    new Set(
      records
        .filter((record) => Boolean(record.is_finalised))
        .map((record) => String(record.pay_cycle || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  select.innerHTML = `<option value="">All cycles</option>`;

  payCycles.forEach((payCycle) => {
    const option = document.createElement("option");
    option.value = payCycle;
    option.textContent = payCycle;
    select.appendChild(option);
  });

  if (
    currentValue &&
    Array.from(select.options).some((option) => option.value === currentValue)
  ) {
    select.value = currentValue;
  }

  // DESCRIPTION ITEM 4 - STEP 3
  // After rebuilding the action-cycle dropdown, update the Send Payslips
  // button so it reflects the available finalised payroll records.
  updateSendPayslipsButtonState();
}

// DESCRIPTION ITEM 4 - STEP 3
// Return finalised payroll records for the currently selected payroll action cycle.
// This mirrors the CSV export cycle behaviour but does not send anything yet.
function getFinalisedPayrollRecordsForSelectedActionCycle() {
  const selectedPayCycle = String(state.dom.exportPayrollPayCycle?.value || "").trim();

  return (state.payrollRecords || []).filter((record) => {
    const isFinalised = Boolean(record.is_finalised);
    const recordPayCycle = String(record.pay_cycle || "").trim();

    if (!selectedPayCycle) return isFinalised;

    return isFinalised && recordPayCycle === selectedPayCycle;
  });
}

// PAYROLL CSV EXPORT FIX - STEP 2
// Keep Export CSV separate from Send Payslips.
// Export CSV downloads a bank-ready spreadsheet.
// Send Payslips prepares payslip email audit rows.
function updateExportPayrollCsvButtonState() {
  const button = state.dom.exportPayrollCsvBtn;
  if (!button) return;

  const finalisedRecords = getFinalisedPayrollRecordsForSelectedActionCycle();
  const canExport = finalisedRecords.length > 0;

  button.disabled = !canExport;

  button.title = canExport
    ? `${finalisedRecords.length} finalised payroll record(s) available for CSV export.`
    : "No finalised payroll records are available for CSV export in the selected action cycle.";

  button.classList.toggle("btn-outline-primary", canExport);
  button.classList.toggle("btn-secondary", !canExport);
}

// DESCRIPTION ITEM 4 - STEP 3
// Enable Send Payslips only when there are finalised payroll records
// for the selected action cycle. This does not export CSV.
function updateSendPayslipsButtonState() {
  const button = state.dom.sendPayslipsEmailBtn;
  if (!button) return;

  const finalisedRecords = getFinalisedPayrollRecordsForSelectedActionCycle();
  const canSend = finalisedRecords.length > 0;

  button.disabled = !canSend;

  button.title = canSend
    ? `${finalisedRecords.length} finalised payroll record(s) available for payslip email.`
    : "No finalised payroll records are available for the selected action cycle.";

  button.classList.toggle("btn-outline-success", canSend);
  button.classList.toggle("btn-secondary", !canSend);

  // PAYROLL CSV EXPORT FIX - STEP 2
  // Keep Export CSV state updated wherever the existing Send Payslips
  // state refresh already happens.
  updateExportPayrollCsvButtonState();
}
// DESCRIPTION ITEM 4 - STEP 4
// Loading state for Send Payslips.
// Keeps the button from being clicked repeatedly while audit rows are created.
function setSendPayslipsEmailLoading(isLoading) {
  const button = state.dom.sendPayslipsEmailBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Preparing Payslips...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }

  updateSendPayslipsButtonState();
}

// DESCRIPTION ITEM 4 - STEP 6
// Show loading feedback inside the Payslip Email Status table.
function renderPayslipEmailLogsLoadingState() {
  const tbody = state.dom.payslipEmailLogsTableBody;
  if (!tbody) return;

  state.dom.payslipEmailLogsEmptyState?.classList.add("d-none");
  state.dom.payslipEmailLogsTableWrapper?.classList.remove("d-none");

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-secondary py-4">
        Loading payslip email status records.
      </td>
    </tr>
  `;
}

// DESCRIPTION ITEM 4 - STEP 6
// Keep Refresh Status from being clicked repeatedly while Supabase is loading.
function setPayslipEmailLogsRefreshLoading(isLoading) {
  const button = state.dom.refreshPayslipEmailLogsBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Refreshing...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }

  button.disabled = false;
}

// DESCRIPTION ITEM 4 - STEP 6
// Badge colours for payslip email delivery/audit statuses.
function getPayslipEmailLogStatusBadgeClass(status) {
  const normalisedStatus = normalizeText(status);

  if (normalisedStatus === "sent") return "text-bg-success";
  if (normalisedStatus === "failed") return "text-bg-danger";
  if (normalisedStatus === "pending") return "text-bg-secondary";

  return "text-bg-light border text-dark";
}

// DESCRIPTION ITEM 4 - STEP 6
// Update compact status counts from the loaded payslip email logs.
function updatePayslipEmailStatusCounts(records = []) {
  const pendingCount = records.filter(
    (record) => normalizeText(record.status) === "pending",
  ).length;

  const sentCount = records.filter(
    (record) => normalizeText(record.status) === "sent",
  ).length;

  const failedCount = records.filter(
    (record) => normalizeText(record.status) === "failed",
  ).length;

  if (state.dom.payslipEmailPendingCount) {
    state.dom.payslipEmailPendingCount.textContent = String(pendingCount);
  }

  if (state.dom.payslipEmailSentCount) {
    state.dom.payslipEmailSentCount.textContent = String(sentCount);
  }

  if (state.dom.payslipEmailFailedCount) {
    state.dom.payslipEmailFailedCount.textContent = String(failedCount);
  }
}

// DESCRIPTION ITEM 4 - STEP 6
// Render payslip email audit rows in the compact status panel.
function renderPayslipEmailLogs(records = []) {
  const tbody = state.dom.payslipEmailLogsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  updatePayslipEmailStatusCounts(records);

  if (!records.length) {
    state.dom.payslipEmailLogsEmptyState?.classList.remove("d-none");
    state.dom.payslipEmailLogsTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.payslipEmailLogsEmptyState?.classList.add("d-none");
  state.dom.payslipEmailLogsTableWrapper?.classList.remove("d-none");

  records.forEach((record) => {
    const employee = record.employees || {};

    const employeeName =
      `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
      record.recipient_email ||
      "Unknown Employee";

    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(employeeName)}</div>
        <div class="text-secondary small text-break">
          ${escapeHtml(record.recipient_email || "--")}
        </div>
      </td>

      <td>${escapeHtml(record.pay_cycle || "--")}</td>

      <td>
        <span class="badge ${getPayslipEmailLogStatusBadgeClass(record.status)}">
          ${escapeHtml(formatStatusLabel(record.status || "Pending"))}
        </span>
      </td>

      <td>${record.sent_at ? formatDate(record.sent_at) : "--"}</td>

      <td class="text-break">
        ${escapeHtml(record.error_message || "--")}
      </td>
    `;

    tbody.appendChild(row);
  });
}

// DESCRIPTION ITEM 4 - STEP 6
// Load payslip email logs for the selected Payroll action cycle.
// If All cycles is selected, it loads all prepared payslip email logs.
async function refreshPayslipEmailLogs(options = {}) {
  const { showAlert = false } = options;
  const selectedPayCycle = String(state.dom.exportPayrollPayCycle?.value || "").trim();

  try {
    setPayslipEmailLogsRefreshLoading(true);
    renderPayslipEmailLogsLoadingState();

    const supabase = getSupabaseClient();

    let query = supabase
      .from("payslip_email_logs")
      .select(`
        *,
        employees (
          id,
          first_name,
          last_name,
          work_email,
          employee_number
        )
      `)
      .order("created_at", { ascending: false });

    if (selectedPayCycle) {
      query = query.eq("pay_cycle", selectedPayCycle);
    }

    const { data, error } = await query;

    if (error) throw error;

    state.payslipEmailLogs = Array.isArray(data) ? data : [];
    state.filteredPayslipEmailLogs = [...state.payslipEmailLogs];

    renderPayslipEmailLogs(state.filteredPayslipEmailLogs);

    if (showAlert) {
      showPageAlert(
        "success",
        `${state.filteredPayslipEmailLogs.length} payslip email status record(s) loaded.`,
      );
    }
  } catch (error) {
    console.error("Error loading payslip email logs:", error);

    state.payslipEmailLogs = [];
    state.filteredPayslipEmailLogs = [];

    renderPayslipEmailLogs([]);

    showPageAlert(
      "danger",
      error.message || "Payslip email status records could not be loaded.",
    );
  } finally {
    setPayslipEmailLogsRefreshLoading(false);
  }
}

// DESCRIPTION ITEM 4 - STEP 4
// Resolve a readable employee name for validation and messages.
function getPayrollRecordEmployeeName(record) {
  return (
    `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
    record.work_email ||
    "Unknown Employee"
  );
}

// DESCRIPTION ITEM 4 - STEP 4
// Build one audit payload for a payroll record.
// The status is Pending because actual delivery is handled separately
// by the secure email sending function.
function buildPayslipEmailLogPayload(record) {
  return {
    payroll_record_id: record.id,
    employee_id: record.employee_id,
    recipient_email: String(record.work_email || "").trim().toLowerCase(),
    pay_cycle: String(record.pay_cycle || "").trim(),
    status: "Pending",
    error_message: null,
    sent_at: null,
  };
}

// DESCRIPTION ITEM 4 - STEP 4
// Prepare payslip email audit rows for the selected payroll action cycle.
// This does not send emails yet. It validates the run and creates/updates
// Pending logs so the next secure email step has a controlled queue to process.
async function handleSendPayslipsEmailRequest() {
  clearPageAlert();

  const finalisedRecords = getFinalisedPayrollRecordsForSelectedActionCycle();

  if (!finalisedRecords.length) {
    showPageAlert(
      "warning",
      "No finalised payroll records are available for the selected action cycle.",
    );
    return;
  }

  const recordsMissingRequiredData = finalisedRecords.filter((record) => {
    const hasPayrollRecordId = Boolean(String(record.id || "").trim());
    const hasEmployeeId = Boolean(String(record.employee_id || "").trim());
    const hasRecipientEmail = Boolean(String(record.work_email || "").trim());
    const hasPayCycle = Boolean(String(record.pay_cycle || "").trim());

    return !hasPayrollRecordId || !hasEmployeeId || !hasRecipientEmail || !hasPayCycle;
  });

  if (recordsMissingRequiredData.length) {
    const names = recordsMissingRequiredData
      .slice(0, 5)
      .map((record) => getPayrollRecordEmployeeName(record));

    const extraCount = recordsMissingRequiredData.length - names.length;

    showPageAlert(
      "warning",
      `Payslip email preparation stopped because ${recordsMissingRequiredData.length} payroll record(s) are missing employee, email, or pay-cycle data. Affected: <strong>${escapeHtml(
        names.join(", "),
      )}${extraCount > 0 ? `, and ${extraCount} more` : ""}</strong>.`,
    );

    return;
  }

  try {
    setSendPayslipsEmailLoading(true);
    await waitForNextPaint();

    const supabase = getSupabaseClient();
    const payrollRecordIds = finalisedRecords.map((record) => record.id);

    const { data: existingLogs, error: existingLogsError } = await supabase
      .from("payslip_email_logs")
      .select("payroll_record_id, status")
      .in("payroll_record_id", payrollRecordIds);

    if (existingLogsError) throw existingLogsError;

    const existingLogMap = new Map(
      (existingLogs || []).map((log) => [
        String(log.payroll_record_id),
        normalizeText(log.status),
      ]),
    );

    const recordsToPrepare = finalisedRecords.filter((record) => {
      const existingStatus = existingLogMap.get(String(record.id));

      // Do not disturb rows already pending or sent.
      // Failed rows can be prepared again by resetting them to Pending.
      return !existingStatus || existingStatus === "failed";
    });

    const alreadyPendingCount = finalisedRecords.filter(
      (record) => existingLogMap.get(String(record.id)) === "pending",
    ).length;

    const alreadySentCount = finalisedRecords.filter(
      (record) => existingLogMap.get(String(record.id)) === "sent",
    ).length;

    if (!recordsToPrepare.length) {
      showPageAlert(
        "info",
        `No new payslip email logs were created. ${alreadyPendingCount} record(s) are already pending and ${alreadySentCount} record(s) are already marked as sent.`,
      );
      return;
    }

    const payload = recordsToPrepare.map((record) =>
      buildPayslipEmailLogPayload(record),
    );

    const { error: upsertError } = await supabase
      .from("payslip_email_logs")
      .upsert(payload, {
        onConflict: "payroll_record_id",
      });

    if (upsertError) throw upsertError;

    showPageAlert(
      "success",
      `${recordsToPrepare.length} payslip email log(s) prepared for the selected payroll action cycle. ${alreadyPendingCount} record(s) were already pending and ${alreadySentCount} record(s) were already sent.`,
    );

    // DESCRIPTION ITEM 4 - STEP 6
    // Reload the status panel immediately after preparing logs so HR can see
    // the Pending records without manually refreshing.
    await refreshPayslipEmailLogs();
  } catch (error) {
    console.error("Error preparing payslip email logs:", error);

    showPageAlert(
      "danger",
      error.message || "Payslip email logs could not be prepared.",
    );
  } finally {
    setSendPayslipsEmailLoading(false);
  }
}
function renderPayrollSummary(records) {
  const finalisedCount = records.filter((record) => Boolean(record.is_finalised)).length;
  const grossTotal = records.reduce(
    (total, record) => total + Number(record.gross_pay || 0),
    0,
  );
  const netTotal = records.reduce(
    (total, record) => total + Number(record.net_pay || 0),
    0,
  );

  if (state.dom.payrollRecordCountValue) {
    state.dom.payrollRecordCountValue.textContent = String(records.length);
  }

  if (state.dom.payrollFinalisedCountValue) {
    state.dom.payrollFinalisedCountValue.textContent = String(finalisedCount);
  }

  if (state.dom.payrollGrossTotalValue) {
    state.dom.payrollGrossTotalValue.textContent = formatCurrency(grossTotal, "NGN");
  }

  if (state.dom.payrollNetTotalValue) {
    state.dom.payrollNetTotalValue.textContent = formatCurrency(netTotal, "NGN");
  }
}

function renderPayrollRecordsLoadingState() {
  if (!state.dom.payrollRecordsTableBody) return;

  if (state.dom.payrollRecordsEmptyState) {
    state.dom.payrollRecordsEmptyState.classList.add("d-none");
  }

  if (state.dom.payrollRecordsTableWrapper) {
    state.dom.payrollRecordsTableWrapper.classList.remove("d-none");
  }

  state.dom.payrollRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="11" class="text-center text-secondary py-4">
        Loading payroll records.
      </td>
    </tr>
  `;
}

function renderPayrollRecords(records) {
  const tbody = state.dom.payrollRecordsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    if (state.dom.payrollRecordsEmptyState) {
      state.dom.payrollRecordsEmptyState.classList.remove("d-none");
    }
    if (state.dom.payrollRecordsTableWrapper) {
      state.dom.payrollRecordsTableWrapper.classList.add("d-none");
    }
    return;
  }

  if (state.dom.payrollRecordsEmptyState) {
    state.dom.payrollRecordsEmptyState.classList.add("d-none");
  }
  if (state.dom.payrollRecordsTableWrapper) {
    state.dom.payrollRecordsTableWrapper.classList.remove("d-none");
  }

  // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
  // Render newly submitted/updated payroll records first.
  const recordsToRender = sortPayrollRecordsByLatestActivity(records);

  recordsToRender.forEach((record) => {
    const fullName = `${record.first_name || ""} ${record.last_name || ""}`.trim();

    // DESCRIPTION ITEM 4 - STEP 7
    // Prepare a safe payroll record id for inline table actions.
    const safePayrollRecordId = String(record.id || "").replaceAll("'", "\\'");

    // DESCRIPTION ITEM 4 - STEP 7
    // Payslip preview should only be available for finalised payroll records.
    const canPreviewPayslip = Boolean(record.is_finalised);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 8B
             Combine employee identity and department details into one cell
             so the payroll records table fits inside one card without side scroll. -->
        <div class="fw-semibold">${escapeHtml(fullName || "Unknown Employee")}</div>
        <div class="text-secondary small text-break">
          ${escapeHtml(record.work_email || "--")}
        </div>
        <div class="text-secondary small">
          ${escapeHtml(record.department || "--")} • ${escapeHtml(record.job_title || "--")}
        </div>
      </td>

      <td>
        <!-- PAYROLL RECORDS GROUP LABELS - STEP 12C
             Display payroll group labels consistently without changing
             the stored database values. -->
        <div class="fw-semibold">${escapeHtml(formatPayrollGroupDisplayLabel(record.employee_group))}</div>
        <div class="text-secondary small">
          ${escapeHtml(record.pay_cycle || "--")}
        </div>
      </td>

<td class="align-middle">
  <!-- PAYROLL RECORDS DATE CLARITY - STEP 12B
       Pay Date is the payroll/payment date.
       Submitted is the audit timestamp when HR created or updated the record.
       Short labels prevent the table from becoming too wide. -->
  <div class="fw-medium text-nowrap" title="Payroll pay date">
    Pay: ${formatDate(record.pay_date)}
  </div>
  <div class="text-secondary small text-nowrap" title="Submitted date and time" style="margin-top: 4px;">
    Sub: ${formatCompactDateTime(record.updated_at || record.created_at)}
  </div>
</td>

      <td>
        <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 8B
             Group payroll money values into one summary cell instead of three separate columns. -->
        <div class="small">
          <span class="text-secondary">Gross:</span>
          <span class="fw-semibold">${formatCurrency(record.gross_pay, record.currency || "NGN")}</span>
        </div>
        <div class="small">
          <span class="text-secondary">Ded:</span>
          <span class="fw-semibold">${formatCurrency(record.total_deductions, record.currency || "NGN")}</span>
        </div>
        <div class="small">
          <span class="text-secondary">Net:</span>
          <span class="fw-semibold">${formatCurrency(record.net_pay, record.currency || "NGN")}</span>
        </div>
      </td>

      <td>
        <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 8B
             Combine payroll status and finalisation into one compact status cell. -->
        <div class="mb-1">
          <span class="badge ${getPayrollStatusBadgeClass(record.status)}">
            ${escapeHtml(formatStatusLabel(record.status))}
          </span>
        </div>
        <div>
          <span class="badge ${record.is_finalised
        ? "text-bg-success"
        : "text-bg-light border text-dark"
      }">
            ${record.is_finalised ? "Finalised" : "Not Finalised"}
          </span>
        </div>
      </td>
<td class="text-center">
  <!-- DESCRIPTION ITEM 4 - STEP 7
       Add payslip preview beside edit.
       Preview is disabled until the payroll record is finalised. -->
  <div class="d-inline-flex justify-content-center gap-2">
    <button
      type="button"
      class="btn btn-sm ${canPreviewPayslip ? "btn-outline-secondary" : "btn-outline-light border"}"
      title="${canPreviewPayslip ? "Preview payslip" : "Preview available after payroll is finalised"}"
      aria-label="Preview payslip"
      ${canPreviewPayslip ? `onclick="window.hrPreviewPayslipRecord('${safePayrollRecordId}')"` : "disabled"}
    >
      <i class="bi bi-receipt"></i>
    </button>

    <button
      type="button"
      class="btn btn-sm btn-outline-primary"
      title="Edit payroll record"
      aria-label="Edit payroll record"
      onclick="window.hrEditPayrollRecord('${safePayrollRecordId}')"
    >
      <i class="bi bi-pencil-square"></i>
    </button>
  </div>
</td>
    `;

    tbody.appendChild(row);
  });
}

// SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 5
// Dynamically builds pay-cycle options for the current year and next year.
// This prevents the dropdown from becoming stale when the system moves into 2027+.
function populatePayrollPayCycleOptions() {
  const select = state.dom.payrollPayCycle;
  if (!select) return;

  const currentValue = select.value;
  const currentYear = new Date().getFullYear();
  const yearsToShow = [currentYear, currentYear + 1];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  select.innerHTML = `<option value="">Select pay cycle</option>`;

  yearsToShow.forEach((year) => {
    months.forEach((month) => {
      const value = `${month} ${year}`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  });

  if (currentValue) {
    const stillExists = Array.from(select.options).some(
      (option) => option.value === currentValue,
    );

    if (stillExists) {
      select.value = currentValue;
    }
  }
}

// BATCH PAYROLL DEFAULT - STEP 6B
// Populate the batch payroll pay period dropdown independently from
// the hidden individual payroll form dropdown.
function populateBatchPayrollPayCycleOptions() {
  const select = state.dom.batchPayrollPayCycle;
  if (!select) return;

  const currentValue = select.value;
  const currentYear = new Date().getFullYear();
  const yearsToShow = [currentYear, currentYear + 1];

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  select.innerHTML = `<option value="">Select pay period</option>`;

  yearsToShow.forEach((year) => {
    months.forEach((month) => {
      const value = `${month} ${year}`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  });

  if (currentValue) {
    const stillExists = Array.from(select.options || []).some(
      (option) => option.value === currentValue,
    );

    if (stillExists) {
      select.value = currentValue;
      return;
    }
  }

  // BATCH PAYROLL DEFAULT - STEP 6B
  // Default batch payroll to the current month so HR does not start
  // from a blank period every time Run Payroll is opened.
  const today = new Date();
  const defaultPayCycle = `${months[today.getMonth()]} ${today.getFullYear()}`;

  const defaultExists = Array.from(select.options || []).some(
    (option) => option.value === defaultPayCycle,
  );

  if (defaultExists) {
    select.value = defaultPayCycle;
    updateBatchPayDateFromPayCycle();
  }
}

// BATCH PAYROLL DEFAULT - STEP 6B
// Converts the selected batch pay period, e.g. "Apr 2026",
// into the month-end batch pay date.
function updateBatchPayDateFromPayCycle() {
  const cycleValue = String(state.dom.batchPayrollPayCycle?.value || "").trim();
  if (!cycleValue || !state.dom.batchPayrollPayDate) return;

  const [monthText, yearText] = cycleValue.split(" ");

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const monthIndex = months[monthText];
  const year = Number(yearText);

  if (!Number.isInteger(monthIndex) || !Number.isFinite(year)) return;

  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
  const yyyy = lastDayOfMonth.getFullYear();
  const mm = String(lastDayOfMonth.getMonth() + 1).padStart(2, "0");
  const dd = String(lastDayOfMonth.getDate()).padStart(2, "0");

  state.dom.batchPayrollPayDate.value = `${yyyy}-${mm}-${dd}`;

  // BATCH PAYROLL DEFAULT - STEP 7
  // Changing the pay period affects whether the batch is ready to submit.
  updateSubmitBatchPayrollButtonState();
}

// SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 4
// Auto-populate the payroll form from the latest payroll master record
// when a single employee is selected for payroll.
function populatePayrollFormFromEmployeeMaster(employeeId) {
  const employeeKey = String(employeeId || "").trim();
  if (!employeeKey) return;

  const latestPayrollProfile = getLatestPayrollMasterProfileForEmployee(employeeKey);
  if (!latestPayrollProfile) return;

  if (state.dom.payrollBaseSalary) {
    state.dom.payrollBaseSalary.value = latestPayrollProfile.basic_salary ?? "";
  }

  if (state.dom.payrollEmployeeGroup) {
    state.dom.payrollEmployeeGroup.value = "REGULAR";
  }

  if (state.dom.payrollModel) {
    state.dom.payrollModel.value = "REGULAR";
  }

  // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 4 FIX
  // Payroll master pay_cycle is pay frequency, e.g. Monthly.
  // Submit Payroll pay_cycle is the payroll period, e.g. Jan 2026.
  // Therefore, default the payroll period to the current month if HR has not selected one.
  if (state.dom.payrollPayCycle && !state.dom.payrollPayCycle.value) {
    const monthLabels = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const today = new Date();
    const defaultPayCycle = `${monthLabels[today.getMonth()]} ${today.getFullYear()}`;

    const optionExists = Array.from(state.dom.payrollPayCycle.options || []).some(
      (option) => option.value === defaultPayCycle,
    );

    if (optionExists) {
      state.dom.payrollPayCycle.value = defaultPayCycle;
      updatePayDateFromPayCycle();
    }
  }

  updatePayrollModelUi("group");
  recalculatePayrollFormTotals();
}

// SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 5
// Converts a selected pay cycle such as "Oct 2026" into the month-end pay date.
function updatePayDateFromPayCycle() {
  const cycleValue = String(state.dom.payrollPayCycle?.value || "").trim();
  if (!cycleValue || !state.dom.payrollPayDate) return;

  const [monthText, yearText] = cycleValue.split(" ");
  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const monthIndex = months[monthText];
  const year = Number(yearText);

  if (!Number.isInteger(monthIndex) || !Number.isFinite(year)) return;

  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
  const yyyy = lastDayOfMonth.getFullYear();
  const mm = String(lastDayOfMonth.getMonth() + 1).padStart(2, "0");
  const dd = String(lastDayOfMonth.getDate()).padStart(2, "0");

  state.dom.payrollPayDate.value = `${yyyy}-${mm}-${dd}`;

  // HR BUTTON UNIFORMITY - STEP 6B
  // Pay date is auto-filled from pay cycle, so re-check Submit Payroll state.
  updatePayrollSubmitButtonState();
}

function resetPayrollForm() {
  if (!state.dom.payrollCreateForm) return;

  state.dom.payrollCreateForm.reset();
  state.currentEditingPayroll = null;

  // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - FINAL CLEANUP
  // Explicitly clear payroll form fields after create/update so the form
  // does not keep old payroll values after a successful submit.
  [
    state.dom.payrollEmployeeId,
    state.dom.payrollPayCycle,
    state.dom.payrollPayDate,
    state.dom.payrollEmployeeGroup,
    state.dom.payrollModel,
    state.dom.payrollReference,
    state.dom.payrollBaseSalary,
    state.dom.payrollBasicPay,
    state.dom.payrollHousingAllowance,
    state.dom.payrollTransportAllowance,
    state.dom.payrollUtilityAllowance,
    state.dom.payrollMedicalAllowance,
    state.dom.payrollOtherAllowance,
    state.dom.payrollBonus,
    state.dom.payrollOvertime,
    state.dom.payrollLogisticsAllowance,
    state.dom.payrollDataAirtimeAllowance,
    state.dom.payrollGrossPay,
    state.dom.payrollPayeTax,
    state.dom.payrollWhtTax,
    state.dom.payrollEmployeePension,
    state.dom.payrollEmployerPension,
    state.dom.payrollOtherDeductions,
    state.dom.payrollTotalDeductions,
    state.dom.payrollNetPay,
    state.dom.payrollNotes,
    state.dom.regularIncrementAmount,
    state.dom.regularMeritIncrement,
    state.dom.regularNewBaseSalary,
    state.dom.regularBht,
    state.dom.regularNetSalary,
    state.dom.regularMonthlySalaryPlusLogistics,
  ].forEach((field) => {
    if (field) field.value = "";
  });

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 2
  // Hide the exemption note when the payroll form is cleared/reset.
  state.dom.payrollPayeTaxNote?.classList.add("d-none");

  const fieldsToReset = [
    state.dom.payrollEmployeeId,
    state.dom.payrollPayCycle,
    state.dom.payrollPayDate,
    state.dom.payrollGrossPay,
    state.dom.payrollTotalDeductions,
    state.dom.payrollNetPay,
  ];

  fieldsToReset.forEach((field) => {
    field?.classList.remove("is-invalid");
  });

  if (state.dom.editingPayrollId) {
    state.dom.editingPayrollId.value = "";
  }

  if (state.dom.payrollCurrency) {
    state.dom.payrollCurrency.value = "NGN";
  }

  if (state.dom.payrollStatus) {
    state.dom.payrollStatus.value = "Authorised";
  }

  if (state.dom.payrollIsFinalised) {
    state.dom.payrollIsFinalised.checked = true;
  }

  if (state.dom.payrollModel) {
    state.dom.payrollModel.value = "";
  }

  if (state.dom.payrollFormTitle) {
    state.dom.payrollFormTitle.textContent = "Create Payroll Record";
  }

  if (state.dom.payrollFormSubtext) {
    state.dom.payrollFormSubtext.textContent =
      "Enter payroll details for an employee. Core monetary fields use NGN.";
  }

  if (state.dom.payrollFormModeBadge) {
    state.dom.payrollFormModeBadge.textContent = "Create Mode";
    state.dom.payrollFormModeBadge.className =
      "badge rounded-pill text-bg-light border px-3 py-2";
  }

  if (state.dom.cancelPayrollEditBtn) {
    state.dom.cancelPayrollEditBtn.classList.add("d-none");
  }

  if (state.dom.savePayrollBtn) {
    // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 1
    // Keep the default payroll action aligned with the new story wording.
    state.dom.savePayrollBtn.innerHTML = `
    <i class="bi bi-send-check me-2"></i>
    <span id="savePayrollBtnText">Submit Payroll</span>
  `;
    state.dom.savePayrollBtnText = document.getElementById("savePayrollBtnText");
  }

  // DESCRIPTION ITEM 2 - STEP 1
  // Clear the read-only payroll employee reference when the payroll form resets.
  renderPayrollSelectedEmployeeReference("");

  // BATCH PAYROLL DEFAULT - STEP 6A
  // If HR returns to the normal individual payroll form, restore the correct
  // toolbar and hide the batch-only review panel.
  setPayrollRecordToolbarForManualMode();
  state.dom.batchPayrollReviewPanel?.classList.add("d-none");
  state.dom.batchPayrollSetupWarning?.classList.add("d-none");
  state.dom.payrollCreateForm?.classList.remove("d-none");

  updatePayrollModelUi("group");
}

function exitPayrollEditMode() {
  resetPayrollForm();
}

async function loadPayrollRecordForEdit(payrollId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("payroll_records")
    .select("*")
    .eq("id", payrollId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// DESCRIPTION ITEM 4 - STEP 7
// Opens the Payslip Preview modal.
function showPayslipPreviewModal() {
  const modal = state.dom.payslipPreviewModal;
  if (!modal) return;

  modal.classList.remove("d-none");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("overflow-hidden");
}

// DESCRIPTION ITEM 4 - STEP 7
// Closes the Payslip Preview modal and clears the body scroll lock.
function closePayslipPreview() {
  const modal = state.dom.payslipPreviewModal;
  if (!modal) return;

  modal.classList.add("d-none");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overflow-hidden");
}

// DESCRIPTION ITEM 4 - STEP 7
// Render a simple list of payslip earning/deduction lines.
function renderPayslipPreviewLineItems(items = [], currency = "NGN", emptyText = "No items recorded.") {
  const visibleItems = items.filter((item) => Number(item.amount || 0) > 0);

  if (!visibleItems.length) {
    return `
      <div class="text-secondary small border rounded-3 p-3">
        ${escapeHtml(emptyText)}
      </div>
    `;
  }

  return visibleItems
    .map(
      (item) => `
        <div class="d-flex justify-content-between gap-3 border-bottom py-2">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(formatCurrency(item.amount, currency))}</strong>
        </div>
      `,
    )
    .join("");
}

// DESCRIPTION ITEM 4 - STEP 7
// Builds the payslip preview content for a finalised payroll record.
// This is review-only and does not send email.
function renderPayslipPreview(payrollRecord) {
  const content = state.dom.payslipPreviewContent;
  if (!content) return;

  const currency = payrollRecord.currency || "NGN";
  const employeeName =
    `${payrollRecord.first_name || ""} ${payrollRecord.last_name || ""}`.trim() ||
    payrollRecord.work_email ||
    "Unknown Employee";

  const earningsHtml = renderPayslipPreviewLineItems(
    [
      { label: "Base Salary", amount: payrollRecord.basic_salary },
      { label: "Housing Allowance", amount: payrollRecord.housing_allowance },
      { label: "Transport Allowance", amount: payrollRecord.transport_allowance },
      { label: "Utility Allowance", amount: payrollRecord.utility_allowance },
      { label: "Medical Allowance", amount: payrollRecord.medical_allowance },
      { label: "Logistics Allowance", amount: payrollRecord.logistics_allowance },
      { label: "Data & Airtime", amount: payrollRecord.data_airtime_allowance },
      { label: "Other Allowance", amount: payrollRecord.other_allowance },
    ],
    currency,
    "No earnings or allowance breakdown recorded.",
  );

  const deductionsHtml = renderPayslipPreviewLineItems(
    [
      { label: "PAYE Tax", amount: payrollRecord.paye_tax },
      { label: "WHT Tax", amount: payrollRecord.wht_tax },
      { label: "Employee Pension", amount: payrollRecord.employee_pension },
      { label: "Employer Pension", amount: payrollRecord.employer_pension },
      { label: "Other Deductions", amount: payrollRecord.other_deductions },
    ],
    currency,
    "No deduction breakdown recorded.",
  );

  if (state.dom.payslipPreviewTitle) {
    state.dom.payslipPreviewTitle.textContent = `Payslip Preview - ${payrollRecord.pay_cycle || "Payroll"}`;
  }

  content.innerHTML = `
    <div class="border rounded-4 p-4 mb-4 bg-light-subtle">
      <div class="d-flex flex-column flex-md-row justify-content-between gap-3">
        <div>
          <div class="text-secondary small">Employee</div>
          <div class="h5 mb-1">${escapeHtml(employeeName)}</div>
          <div class="text-secondary small text-break">
            ${escapeHtml(payrollRecord.work_email || "--")}
          </div>
          <div class="text-secondary small">
            ${escapeHtml(payrollRecord.department || "--")} • ${escapeHtml(payrollRecord.job_title || "--")}
          </div>
        </div>

        <div class="text-md-end">
          <div class="text-secondary small">Pay Cycle</div>
          <div class="fw-semibold">${escapeHtml(payrollRecord.pay_cycle || "--")}</div>
          <div class="text-secondary small mt-2">Pay Date</div>
          <div class="fw-semibold">${formatDate(payrollRecord.pay_date)}</div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="border rounded-4 p-3 h-100">
          <div class="text-secondary small">Gross Pay</div>
          <div class="h5 mb-0">${escapeHtml(formatCurrency(payrollRecord.gross_pay, currency))}</div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="border rounded-4 p-3 h-100">
          <div class="text-secondary small">Total Deductions</div>
          <div class="h5 mb-0">${escapeHtml(formatCurrency(payrollRecord.total_deductions, currency))}</div>
        </div>
      </div>

      <div class="col-md-4">
        <div class="border rounded-4 p-3 h-100">
          <div class="text-secondary small">Net Pay</div>
          <div class="h5 mb-0">${escapeHtml(formatCurrency(payrollRecord.net_pay, currency))}</div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-6">
        <div class="border rounded-4 p-4 h-100">
          <h3 class="h6 fw-bold mb-3">Earnings</h3>
          ${earningsHtml}
          <div class="d-flex justify-content-between gap-3 pt-3 mt-2">
            <span class="fw-semibold">Gross Pay</span>
            <strong>${escapeHtml(formatCurrency(payrollRecord.gross_pay, currency))}</strong>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="border rounded-4 p-4 h-100">
          <h3 class="h6 fw-bold mb-3">Deductions</h3>
          ${deductionsHtml}
          <div class="d-flex justify-content-between gap-3 pt-3 mt-2">
            <span class="fw-semibold">Total Deductions</span>
            <strong>${escapeHtml(formatCurrency(payrollRecord.total_deductions, currency))}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="alert alert-light border mt-4 mb-0">
      <div class="fw-semibold mb-1">Preview only</div>
      <div class="small text-secondary">
        This payslip has not been emailed from this preview. Email delivery will be added after sender domain and secure email provider setup are available.
      </div>
    </div>
  `;
}

// DESCRIPTION ITEM 4 - STEP 7
// Loads the full payroll record, merges it with the table row,
// and opens the payslip preview modal for HR review.
async function openPayslipPreview(payrollId) {
  const selectedRow = state.payrollRecords.find(
    (item) => String(item.id) === String(payrollId),
  );

  if (!selectedRow) {
    showPageAlert(
      "warning",
      "The selected payroll record could not be found. Please refresh and try again.",
    );
    return;
  }

  if (!selectedRow.is_finalised) {
    showPageAlert(
      "warning",
      "Payslip preview is only available after the payroll record has been finalised.",
    );
    return;
  }

  clearPageAlert();

  let payrollRecord = selectedRow;

  showPayslipPreviewModal();

  if (state.dom.payslipPreviewContent) {
    state.dom.payslipPreviewContent.innerHTML = `
      <div class="text-center text-secondary py-4">
        Loading payslip preview.
      </div>
    `;
  }

  try {
    const fullRecord = await loadPayrollRecordForEdit(payrollId);

    if (fullRecord) {
      payrollRecord = {
        ...selectedRow,
        ...fullRecord,
      };
    }

    renderPayslipPreview(payrollRecord);
  } catch (error) {
    console.error("Error loading payslip preview:", error);

    closePayslipPreview();

    showPageAlert(
      "danger",
      error.message || "Payslip preview could not be loaded.",
    );
  }
}

async function startPayrollEdit(payrollId) {
  const selectedRow = state.payrollRecords.find(
    (item) => String(item.id) === String(payrollId),
  );

  if (!selectedRow) {
    showPageAlert(
      "warning",
      "The selected payroll record could not be found. Please refresh and try again.",
    );
    return;
  }

  clearPageAlert();

  let payrollRecord = selectedRow;

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 4
  // Open the edit form immediately so HR gets instant feedback after
  // clicking Edit. The full payroll record can still load below and then
  // populate the fields as before.
  switchHrWorkspace("payroll");
  openPayrollRecordCard();

  if (state.dom.payrollCreateForm) {
    state.dom.payrollCreateForm.classList.remove("d-none");
  }

  state.dom.batchPayrollReviewPanel?.classList.add("d-none");
  state.dom.batchPayrollSetupWarning?.classList.add("d-none");
  setPayrollRecordToolbarForManualMode();

  if (state.dom.payrollFormTitle) {
    state.dom.payrollFormTitle.textContent = "Edit Payroll Record";
  }

  if (state.dom.payrollFormSubtext) {
    state.dom.payrollFormSubtext.textContent =
      "Loading payroll details for editing...";
  }

  if (state.dom.payrollFormModeBadge) {
    state.dom.payrollFormModeBadge.textContent = "Edit Mode";
    state.dom.payrollFormModeBadge.className =
      "badge rounded-pill text-bg-primary px-3 py-2";
  }

  scrollToDashboardTarget(
    state.dom.payrollCreateForm?.closest(".dashboard-section-card") ||
      state.dom.payrollCreateForm ||
      state.dom.payrollRecordCardCollapse,
    16,
  );

  try {
    const fullRecord = await loadPayrollRecordForEdit(payrollId);
    if (fullRecord) {
      payrollRecord = {
        ...selectedRow,
        ...fullRecord,
      };
    }
  } catch (error) {
    console.warn(
      "Unable to load full payroll record for edit. Falling back to current list row.",
      error,
    );
  }

  state.currentEditingPayroll = payrollRecord;

  if (state.dom.editingPayrollId) state.dom.editingPayrollId.value = payrollRecord.id || "";
  if (state.dom.payrollEmployeeId) state.dom.payrollEmployeeId.value = payrollRecord.employee_id || "";

  // DESCRIPTION ITEM 2 - STEP 1
  // When editing a payroll record, show the linked HR employee reference immediately.
  renderPayrollSelectedEmployeeReference(payrollRecord.employee_id || "");

  if (state.dom.payrollPayCycle) state.dom.payrollPayCycle.value = payrollRecord.pay_cycle || "";
  if (state.dom.payrollPayDate) state.dom.payrollPayDate.value = payrollRecord.pay_date || "";
  if (state.dom.payrollEmployeeGroup) state.dom.payrollEmployeeGroup.value = payrollRecord.employee_group || "";
  if (state.dom.payrollModel) state.dom.payrollModel.value = payrollRecord.payroll_model || "";
  updatePayrollModelUi("group");
  if (state.dom.payrollStatus) state.dom.payrollStatus.value = payrollRecord.status || "Authorised";
  if (state.dom.payrollReference) state.dom.payrollReference.value = payrollRecord.payroll_reference || "";
  if (state.dom.payrollBaseSalary) state.dom.payrollBaseSalary.value = payrollRecord.base_salary ?? "";
  const isRegularPayrollRecord =
    normalizePayrollGroupForPayload(payrollRecord.employee_group || "") === "REGULAR";

  if (state.dom.regularIncrementPercent) {
    state.dom.regularIncrementPercent.value = isRegularPayrollRecord
      ? payrollRecord.increment_percent != null
        ? (Number(payrollRecord.increment_percent) * 100).toFixed(2)
        : "5.00"
      : "5.00";
  }

  if (state.dom.regularMeritIncrement) {
    state.dom.regularMeritIncrement.value = isRegularPayrollRecord
      ? payrollRecord.merit_increment ?? ""
      : "";
  }

  if (state.dom.regularBasicPercent) {
    state.dom.regularBasicPercent.value = isRegularPayrollRecord
      ? payrollRecord.basic_percent != null
        ? (Number(payrollRecord.basic_percent) * 100).toFixed(2)
        : "50.00"
      : "50.00";
  }

  if (state.dom.regularHousingPercent) {
    state.dom.regularHousingPercent.value = isRegularPayrollRecord
      ? payrollRecord.housing_percent != null
        ? (Number(payrollRecord.housing_percent) * 100).toFixed(2)
        : "10.00"
      : "10.00";
  }

  if (state.dom.regularTransportPercent) {
    state.dom.regularTransportPercent.value = isRegularPayrollRecord
      ? payrollRecord.transport_percent != null
        ? (Number(payrollRecord.transport_percent) * 100).toFixed(2)
        : "10.00"
      : "10.00";
  }

  if (state.dom.regularUtilityPercent) {
    state.dom.regularUtilityPercent.value = isRegularPayrollRecord
      ? payrollRecord.utility_percent != null
        ? (Number(payrollRecord.utility_percent) * 100).toFixed(2)
        : "10.00"
      : "10.00";
  }

  if (state.dom.regularOtherAllowancePercent) {
    state.dom.regularOtherAllowancePercent.value = isRegularPayrollRecord
      ? payrollRecord.other_allowance_percent != null
        ? (Number(payrollRecord.other_allowance_percent) * 100).toFixed(2)
        : "20.00"
      : "20.00";
  }

  if (state.dom.regularIncrementAmount) state.dom.regularIncrementAmount.value = "";
  if (state.dom.regularNewBaseSalary) state.dom.regularNewBaseSalary.value = "";
  if (state.dom.regularBht) state.dom.regularBht.value = "";
  if (state.dom.regularNetSalary) state.dom.regularNetSalary.value = "";
  if (state.dom.regularMonthlySalaryPlusLogistics) {
    state.dom.regularMonthlySalaryPlusLogistics.value = "";
  }
  if (state.dom.payrollBasicPay) state.dom.payrollBasicPay.value = payrollRecord.basic_pay ?? "";
  if (state.dom.payrollHousingAllowance) state.dom.payrollHousingAllowance.value = payrollRecord.housing_allowance ?? "";
  if (state.dom.payrollTransportAllowance) state.dom.payrollTransportAllowance.value = payrollRecord.transport_allowance ?? "";
  if (state.dom.payrollUtilityAllowance) state.dom.payrollUtilityAllowance.value = payrollRecord.utility_allowance ?? "";
  if (state.dom.payrollMedicalAllowance) state.dom.payrollMedicalAllowance.value = payrollRecord.medical_allowance ?? "";
  if (state.dom.payrollOtherAllowance) state.dom.payrollOtherAllowance.value = payrollRecord.other_allowance ?? "";
  if (state.dom.payrollBonus) state.dom.payrollBonus.value = payrollRecord.bonus ?? "";
  if (state.dom.payrollOvertime) state.dom.payrollOvertime.value = payrollRecord.overtime ?? "";
  if (state.dom.payrollLogisticsAllowance) state.dom.payrollLogisticsAllowance.value = payrollRecord.logistics_allowance ?? "";
  if (state.dom.payrollDataAirtimeAllowance) state.dom.payrollDataAirtimeAllowance.value = payrollRecord.data_airtime_allowance ?? "";
  if (state.dom.payrollGrossPay) state.dom.payrollGrossPay.value = payrollRecord.gross_pay ?? "";
  if (state.dom.payrollPayeTax) state.dom.payrollPayeTax.value = payrollRecord.paye_tax ?? "";
  if (state.dom.payrollWhtTax) state.dom.payrollWhtTax.value = payrollRecord.wht_tax ?? "";
  if (state.dom.payrollEmployeePension) state.dom.payrollEmployeePension.value = payrollRecord.employee_pension ?? "";
  if (state.dom.payrollEmployerPension) state.dom.payrollEmployerPension.value = payrollRecord.employer_pension ?? "";
  if (state.dom.payrollOtherDeductions) state.dom.payrollOtherDeductions.value = payrollRecord.other_deductions ?? "";
  if (state.dom.payrollTotalDeductions) state.dom.payrollTotalDeductions.value = payrollRecord.total_deductions ?? "";
  if (state.dom.payrollNetPay) state.dom.payrollNetPay.value = payrollRecord.net_pay ?? "";
  if (state.dom.payrollCurrency) state.dom.payrollCurrency.value = payrollRecord.currency || "NGN";
  if (state.dom.payrollIsFinalised) state.dom.payrollIsFinalised.checked = Boolean(payrollRecord.is_finalised);
  if (state.dom.payrollNotes) state.dom.payrollNotes.value = payrollRecord.notes || "";

  if (state.dom.payrollFormTitle) {
    state.dom.payrollFormTitle.textContent = "Edit Payroll Record";
  }

  if (state.dom.payrollFormSubtext) {
    state.dom.payrollFormSubtext.textContent =
      "Update payroll values, status, and finalisation details for this record.";
  }

  if (state.dom.payrollFormModeBadge) {
    state.dom.payrollFormModeBadge.textContent = "Edit Mode";
    state.dom.payrollFormModeBadge.className =
      "badge rounded-pill text-bg-primary px-3 py-2";
  }

  if (state.dom.cancelPayrollEditBtn) {
    state.dom.cancelPayrollEditBtn.classList.remove("d-none");
  }

  if (state.dom.savePayrollBtn) {
    state.dom.savePayrollBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="savePayrollBtnText">Update Payroll Record</span>
    `;
    state.dom.savePayrollBtnText = document.getElementById("savePayrollBtnText");
  }

  recalculatePayrollFormTotals();

  switchHrWorkspace("payroll");

  // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5 FIX
  // Editing must reopen Create Payroll Record even if HR collapsed it
  // after a previous submit/update.
  openPayrollRecordCard();

  // BATCH PAYROLL DEFAULT - STEP 2A
  // Scroll to the full Create Payroll Batch card instead of the inner
  // batch table. This keeps the card heading visible and prevents the
  // top of the payroll batch card from looking cut off.
  scrollToDashboardTarget(
    state.dom.payrollRecordCardCollapse?.closest(".dashboard-section-card") ||
    state.dom.payrollRecordCardCollapse ||
    state.dom.batchPayrollReviewPanel,
    16,
  );
}

function validatePayrollForm() {
  let isValid = true;
  let firstInvalidField = null;

  // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 1
  // Support both single payroll submission and batch payroll submission.
  // For batch payroll, the employee dropdown can remain blank because the
  // selected employees come from the Full Employee List checkbox selection.
  const selectedBatchEmployeeIds = Array.from(
    state.selectedEmployeesForPayroll || [],
  ).filter(Boolean);

  const isBatchPayrollSubmission =
    selectedBatchEmployeeIds.length > 1 &&
    !String(state.dom.payrollEmployeeId?.value || "").trim();

  const requiredFields = [
    ...(isBatchPayrollSubmission ? [] : [state.dom.payrollEmployeeId]),
    state.dom.payrollPayCycle,
    state.dom.payrollPayDate,
    state.dom.payrollGrossPay,
    state.dom.payrollTotalDeductions,
    state.dom.payrollNetPay,
  ];

  requiredFields.forEach((field) => {
    const value = String(field?.value || "").trim();

    if (!value) {
      field?.classList.add("is-invalid");
      isValid = false;
      if (!firstInvalidField) firstInvalidField = field;
    } else {
      field?.classList.remove("is-invalid");
    }
  });

  const grossPayValue = Number(state.dom.payrollGrossPay?.value || 0);
  const totalDeductionsValue = Number(state.dom.payrollTotalDeductions?.value || 0);
  const netPayValue = Number(state.dom.payrollNetPay?.value || 0);

  const grossPayIsInvalid =
    !Number.isFinite(grossPayValue) || grossPayValue <= 0;

  const totalDeductionsIsInvalid =
    !Number.isFinite(totalDeductionsValue) || totalDeductionsValue < 0;

  const deductionsExceedGross =
    Number.isFinite(grossPayValue) &&
    Number.isFinite(totalDeductionsValue) &&
    totalDeductionsValue > grossPayValue;

  const netPayIsInvalid =
    !Number.isFinite(netPayValue) ||
    netPayValue <= 0 ||
    deductionsExceedGross;

  if (grossPayIsInvalid) {
    state.dom.payrollGrossPay?.classList.add("is-invalid");
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.payrollGrossPay;
  }

  if (totalDeductionsIsInvalid || deductionsExceedGross) {
    state.dom.payrollTotalDeductions?.classList.add("is-invalid");
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.payrollTotalDeductions;
  }

  if (netPayIsInvalid) {
    state.dom.payrollNetPay?.classList.add("is-invalid");
    isValid = false;
    if (!firstInvalidField) firstInvalidField = state.dom.payrollNetPay;
  }

  // PAYROLL CALCULATION REPAIR - STEP 12A
  // Re-apply calculation validity styling so negative Net Pay stays visibly invalid.
  syncPayrollCalculationValidity();

  if (!isValid && firstInvalidField?.focus) {
    firstInvalidField.focus();
  }

  return isValid;
}

function toNullableNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function setNumericFieldValue(field, value) {
  if (!field) return;
  const numericValue = Number(value || 0);
  field.value = numericValue.toFixed(2);
}

// PAYROLL TAX DEDUCTION CALCULATION - STEP 1
// NTA 2025 PAYE tax bands copied from the working TaxCalc model.
// These bands are annual bands. The payroll form works monthly,
// so monthly values are annualised before tax is calculated.
const NTA_2025_PAYE_BANDS = [
  { limit: 800000, rate: 0 },
  { limit: 2200000, rate: 0.15 },
  { limit: 9000000, rate: 0.18 },
  { limit: 12000000, rate: 0.21 },
  { limit: 16000000, rate: 0.23 },
  { limit: Infinity, rate: 0.25 },
];

// PAYROLL TAX DEDUCTION CALCULATION - STEP 1
// Calculates annual PAYE from annual chargeable income using progressive bands.
function calculateAnnualPayeFromBands(chargeableAnnualIncome, bands = NTA_2025_PAYE_BANDS) {
  let remainingIncome = Math.max(0, Number(chargeableAnnualIncome || 0));
  let annualTax = 0;

  bands.forEach((band) => {
    if (remainingIncome <= 0) return;

    const taxableAmount =
      band.limit === Infinity
        ? remainingIncome
        : Math.min(remainingIncome, band.limit);

    annualTax += taxableAmount * band.rate;
    remainingIncome -= taxableAmount;
  });

  return annualTax;
}

// PAYROLL TAX DEDUCTION CALCULATION - STEP 1
// Calculates monthly PAYE using the same NTA 2025 logic as the TaxCalc app.
// HR currently has no Rent Relief field, so annualRentPaid defaults to 0.
function calculateNta2025MonthlyPayeTaxFromComponents({
  basicPay = 0,
  housingAllowance = 0,
  transportAllowance = 0,
  utilityAllowance = 0,
  otherAllowance = 0,
  medicalAllowance = 0,
  bonus = 0,
  overtime = 0,
  logisticsAllowance = 0,
  dataAirtimeAllowance = 0,
  annualRentPaid = 0,
} = {}) {
  const monthlyBasic = Number(basicPay || 0);
  const monthlyHousing = Number(housingAllowance || 0);
  const monthlyTransport = Number(transportAllowance || 0);

  const monthlyGross =
    monthlyBasic +
    monthlyHousing +
    monthlyTransport +
    Number(utilityAllowance || 0) +
    Number(otherAllowance || 0) +
    Number(medicalAllowance || 0) +
    Number(bonus || 0) +
    Number(overtime || 0) +
    Number(logisticsAllowance || 0) +
    Number(dataAirtimeAllowance || 0);

  const annualGross = monthlyGross * 12;

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 1
  // TaxCalc model:
  // Pension = 8% of Basic + Housing + Transport.
  // NHF = 2.5% of Basic.
  // NHIS = 5% of Basic.
  const annualPension =
    (monthlyBasic + monthlyHousing + monthlyTransport) * 12 * 0.08;

  const annualNhf = monthlyBasic * 12 * 0.025;
  const annualNhis = monthlyBasic * 12 * 0.05;

  const annualRentRelief =
    Number(annualRentPaid || 0) > 0
      ? Math.min(Number(annualRentPaid || 0) * 0.2, 500000)
      : 0;

  const annualChargeableIncome = Math.max(
    0,
    annualGross - annualPension - annualNhf - annualNhis - annualRentRelief,
  );

  const annualPayeTax = calculateAnnualPayeFromBands(annualChargeableIncome);

  return annualPayeTax / 12;
}

function calculatePayrollGrossPay() {
  return (
    toNullableNumber(state.dom.payrollBasicPay?.value) +
    toNullableNumber(state.dom.payrollHousingAllowance?.value) +
    toNullableNumber(state.dom.payrollTransportAllowance?.value) +
    toNullableNumber(state.dom.payrollUtilityAllowance?.value) +
    toNullableNumber(state.dom.payrollMedicalAllowance?.value) +
    toNullableNumber(state.dom.payrollOtherAllowance?.value) +
    toNullableNumber(state.dom.payrollBonus?.value) +
    toNullableNumber(state.dom.payrollOvertime?.value) +
    toNullableNumber(state.dom.payrollLogisticsAllowance?.value) +
    toNullableNumber(state.dom.payrollDataAirtimeAllowance?.value)
  );
}

function calculatePayrollTotalDeductions() {
  // EMERGENCY PAYROLL CALCULATION REPAIR
  // Employee Pension is an employee deduction.
  // Employer Pension is an employer cost, so it is not deducted from Net Pay.
  //
  // If the visible Employee Pension field has not refreshed yet but the
  // Regular payroll model is selected, fall back to the calculated employee
  // pension value so Total Deductions does not stay at 0.00 incorrectly.
  const employeePensionValue = toNullableNumber(
    state.dom.payrollEmployeePension?.value,
  );

  const resolvedEmployeePension =
    employeePensionValue > 0 || !isAlpatechRegularSelected()
      ? employeePensionValue
      : calculateRegularEmployeePension();

  return (
    toNullableNumber(state.dom.payrollPayeTax?.value) +
    toNullableNumber(state.dom.payrollWhtTax?.value) +
    resolvedEmployeePension +
    toNullableNumber(state.dom.payrollOtherDeductions?.value)
  );
}

// PAYROLL CALCULATION REPAIR - STEP 12A.2
// Resolve the payroll model safely.
// If the visible Regular/Contract selectors are missing from the running HTML,
// a selected employee with a payroll master salary is treated as Regular.
// This prevents the Regular payroll calculation from silently falling back to Generic.
function getSelectedPayrollModel() {
  const explicitModel = String(state.dom.payrollModel?.value || "")
    .trim()
    .toUpperCase();

  if (explicitModel) {
    return explicitModel;
  }

  const normalizedGroup = normalizePayrollGroupForPayload(
    state.dom.payrollEmployeeGroup?.value || "",
  );

  if (normalizedGroup === "REGULAR") return "REGULAR";
  if (normalizedGroup === "CONTRACT") return "CONTRACTOR";

  const selectedEmployeeId = String(state.dom.payrollEmployeeId?.value || "").trim();
  const hasPayrollMasterSalary =
    selectedEmployeeId &&
    Number(state.dom.payrollBaseSalary?.value || 0) > 0;

  if (hasPayrollMasterSalary) {
    return "REGULAR";
  }

  return "GENERIC";
}

// PAYROLL CALCULATION REPAIR - STEP 12A.2
// These fields are calculated by the Regular payroll model.
// HR should not manually edit them because they are derived from Base Salary
// and the Regular payroll percentages.
function getRegularCalculatedPayrollFields() {
  return [
    state.dom.payrollBasicPay,
    state.dom.payrollHousingAllowance,
    state.dom.payrollTransportAllowance,
    state.dom.payrollUtilityAllowance,
    state.dom.payrollOtherAllowance,
    state.dom.payrollEmployeePension,
    state.dom.payrollEmployerPension,

    // PAYROLL TAX DEDUCTION CALCULATION - STEP 1
    // PAYE Tax is calculated automatically for Regular payroll
    // using the NTA 2025 PAYE model.
    state.dom.payrollPayeTax,
  ].filter(Boolean);
}

// PAYROLL CALCULATION REPAIR - STEP 12A.2
// Lock calculated fields whenever the resolved payroll model is Regular.
// Gross Pay, Total Deductions, and Net Pay are always locked totals.
function syncPayrollCalculatedFieldLockState() {
  const isRegular = getSelectedPayrollModel() === "REGULAR";

  getRegularCalculatedPayrollFields().forEach((field) => {
    field.readOnly = isRegular;
    field.classList.toggle("bg-light", isRegular);

    if (isRegular) {
      field.title = "Calculated automatically from Base Salary and the Regular payroll structure.";
    } else {
      field.removeAttribute("title");
    }
  });

  [
    state.dom.payrollGrossPay,
    state.dom.payrollTotalDeductions,
    state.dom.payrollNetPay,
  ].forEach((field) => {
    if (!field) return;

    field.readOnly = true;
    field.classList.add("bg-light");
    field.title = "Calculated automatically by the payroll form.";
  });
}

// PAYROLL CALCULATION REPAIR - STEP 12A.2
// Keep excessive deductions and negative/zero Net Pay visibly invalid.
function syncPayrollCalculationValidity() {
  const grossPayValue = Number(state.dom.payrollGrossPay?.value || 0);
  const totalDeductionsValue = Number(state.dom.payrollTotalDeductions?.value || 0);
  const netPayValue = Number(state.dom.payrollNetPay?.value || 0);

  const hasGrossPay = Number.isFinite(grossPayValue) && grossPayValue > 0;

  const deductionsExceedGross =
    hasGrossPay &&
    Number.isFinite(totalDeductionsValue) &&
    totalDeductionsValue > grossPayValue;

  const netPayIsInvalid =
    hasGrossPay &&
    (!Number.isFinite(netPayValue) || netPayValue <= 0);

  state.dom.payrollTotalDeductions?.classList.toggle(
    "is-invalid",
    deductionsExceedGross,
  );

  state.dom.payrollNetPay?.classList.toggle(
    "is-invalid",
    deductionsExceedGross || netPayIsInvalid,
  );
}


function updatePayrollModelUi(source = "group") {
  const normalizedGroup = normalizePayrollGroupForPayload(
    state.dom.payrollEmployeeGroup?.value || "",
  );
  const explicitModel = String(state.dom.payrollModel?.value || "")
    .trim()
    .toUpperCase();

  if (source === "model") {
    if (explicitModel === "REGULAR" && state.dom.payrollEmployeeGroup) {
      state.dom.payrollEmployeeGroup.value = "REGULAR";
    } else if (explicitModel === "CONTRACTOR" && state.dom.payrollEmployeeGroup) {
      state.dom.payrollEmployeeGroup.value = "CONTRACT";
    }
  } else {
    if (state.dom.payrollModel) {
      if (normalizedGroup === "REGULAR") {
        state.dom.payrollModel.value = "REGULAR";
      } else if (normalizedGroup === "CONTRACT") {
        state.dom.payrollModel.value = "CONTRACTOR";
      } else if (!normalizedGroup) {
        state.dom.payrollModel.value = "";
      } else {
        state.dom.payrollModel.value = "GENERIC";
      }
    }
  }

  const isRegular = getSelectedPayrollModel() === "REGULAR";

  state.dom.alpatechRegularRev2Section?.classList.toggle("d-none", !isRegular);

  // PAYROLL CALCULATION REPAIR - STEP 12A.1
  // Apply field locking immediately when Regular/Contract/Generic changes.
  syncPayrollCalculatedFieldLockState();

  // PAYROLL STRUCTURE PREVIEW - STEP 12D
  // Keep the compact preview aligned with Employee Group / Payroll Model.
  renderPayrollStructurePreview();

  recalculatePayrollFormTotals();
}

function isAlpatechRegularSelected() {
  return getSelectedPayrollModel() === "REGULAR";
}

function percentInputToDecimal(value, fallbackPercent = 0) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return fallbackPercent / 100;
  }

  const numericValue = Number(trimmed);

  if (!Number.isFinite(numericValue)) {
    return fallbackPercent / 100;
  }

  return numericValue > 1 ? numericValue / 100 : numericValue;
}

function calculateRegularIncrementAmount() {
  return (
    toNullableNumber(state.dom.payrollBaseSalary?.value) *
    percentInputToDecimal(state.dom.regularIncrementPercent?.value, 5)
  );
}

function calculateRegularNewBaseSalary() {
  return (
    toNullableNumber(state.dom.payrollBaseSalary?.value) +
    calculateRegularIncrementAmount() +
    toNullableNumber(state.dom.regularMeritIncrement?.value)
  );
}

function calculateRegularBasicPay() {
  return (
    calculateRegularNewBaseSalary() *
    percentInputToDecimal(state.dom.regularBasicPercent?.value, 50)
  );
}

function calculateRegularHousingAllowance() {
  return (
    calculateRegularNewBaseSalary() *
    percentInputToDecimal(state.dom.regularHousingPercent?.value, 10)
  );
}

function calculateRegularTransportAllowance() {
  return (
    calculateRegularNewBaseSalary() *
    percentInputToDecimal(state.dom.regularTransportPercent?.value, 10)
  );
}

function calculateRegularUtilityAllowance() {
  return (
    calculateRegularNewBaseSalary() *
    percentInputToDecimal(state.dom.regularUtilityPercent?.value, 10)
  );
}

function calculateRegularOtherAllowance() {
  return (
    calculateRegularNewBaseSalary() *
    percentInputToDecimal(state.dom.regularOtherAllowancePercent?.value, 20)
  );
}

function calculateRegularBht() {
  return (
    calculateRegularBasicPay() +
    calculateRegularHousingAllowance() +
    calculateRegularTransportAllowance()
  );
}

function calculateRegularEmployeePension() {
  return calculateRegularBht() * 0.08;
}

function calculateRegularEmployerPension() {
  return calculateRegularBht() * 0.1;
}

// PAYROLL TAX DEDUCTION CALCULATION - STEP 1
// Calculates monthly PAYE for the Regular payroll structure using
// NTA 2025 bands from the TaxCalc model.
function calculateRegularPayeTax() {
  return calculateNta2025MonthlyPayeTaxFromComponents({
    basicPay: calculateRegularBasicPay(),
    housingAllowance: calculateRegularHousingAllowance(),
    transportAllowance: calculateRegularTransportAllowance(),
    utilityAllowance: calculateRegularUtilityAllowance(),
    otherAllowance: calculateRegularOtherAllowance(),

    // These remain optional manual earning components on the HR form.
    medicalAllowance: toNullableNumber(state.dom.payrollMedicalAllowance?.value),
    bonus: toNullableNumber(state.dom.payrollBonus?.value),
    overtime: toNullableNumber(state.dom.payrollOvertime?.value),
    logisticsAllowance: toNullableNumber(state.dom.payrollLogisticsAllowance?.value),
    dataAirtimeAllowance: toNullableNumber(state.dom.payrollDataAirtimeAllowance?.value),
  });
}

function calculateRegularNetSalary() {
  return (
    calculateRegularNewBaseSalary() -
    toNullableNumber(state.dom.payrollPayeTax?.value) -
    toNullableNumber(state.dom.payrollWhtTax?.value) -
    calculateRegularEmployeePension() -
    toNullableNumber(state.dom.payrollOtherDeductions?.value)
  );
}

function calculateRegularMonthlySalaryPlusLogistics() {
  return (
    calculateRegularNetSalary() +
    toNullableNumber(state.dom.payrollLogisticsAllowance?.value)
  );
}

// PAYROLL TAX DEDUCTION CALCULATION - STEP 2
// Shows a simple HR-facing explanation when PAYE is zero because
// the calculated annual chargeable income is within the NTA 2025 tax-free band.
function updatePayrollPayeTaxNote() {
  const note = state.dom.payrollPayeTaxNote;
  if (!note) return;

  const payeValue = Number(state.dom.payrollPayeTax?.value || 0);
  const grossPay = calculatePayrollGrossPay();

  const shouldShowExemptionNote =
    isAlpatechRegularSelected() &&
    Number.isFinite(payeValue) &&
    payeValue === 0 &&
    grossPay > 0;

  note.classList.toggle("d-none", !shouldShowExemptionNote);
}

function applyAlpatechRegularRev2DerivedFields() {
  setNumericFieldValue(
    state.dom.regularIncrementAmount,
    calculateRegularIncrementAmount(),
  );
  setNumericFieldValue(
    state.dom.regularNewBaseSalary,
    calculateRegularNewBaseSalary(),
  );
  setNumericFieldValue(
    state.dom.payrollBasicPay,
    calculateRegularBasicPay(),
  );
  setNumericFieldValue(
    state.dom.payrollHousingAllowance,
    calculateRegularHousingAllowance(),
  );
  setNumericFieldValue(
    state.dom.payrollTransportAllowance,
    calculateRegularTransportAllowance(),
  );
  setNumericFieldValue(
    state.dom.payrollUtilityAllowance,
    calculateRegularUtilityAllowance(),
  );
  setNumericFieldValue(
    state.dom.payrollOtherAllowance,
    calculateRegularOtherAllowance(),
  );
  setNumericFieldValue(
    state.dom.regularBht,
    calculateRegularBht(),
  );
  setNumericFieldValue(
    state.dom.payrollEmployeePension,
    calculateRegularEmployeePension(),
  );
  setNumericFieldValue(
    state.dom.payrollEmployerPension,
    calculateRegularEmployerPension(),
  );

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 1
  // Populate PAYE Tax before Regular Net Salary and Total Deductions
  // are recalculated, so tax is included in deductions automatically.
  setNumericFieldValue(
    state.dom.payrollPayeTax,
    calculateRegularPayeTax(),
  );

  setNumericFieldValue(
    state.dom.regularNetSalary,
    calculateRegularNetSalary(),
  );
  setNumericFieldValue(
    state.dom.regularMonthlySalaryPlusLogistics,
    calculateRegularMonthlySalaryPlusLogistics(),
  );
}

function recalculatePayrollFormTotals() {
  // PAYROLL CALCULATION REPAIR - STEP 12A.2
  // Lock calculated fields before refreshing values.
  syncPayrollCalculatedFieldLockState();

  if (isAlpatechRegularSelected()) {
    applyAlpatechRegularRev2DerivedFields();
  }

  const grossPay = calculatePayrollGrossPay();
  const totalDeductions = calculatePayrollTotalDeductions();
  const netPay = grossPay - totalDeductions;

  setNumericFieldValue(state.dom.payrollGrossPay, grossPay);
  setNumericFieldValue(state.dom.payrollTotalDeductions, totalDeductions);
  setNumericFieldValue(state.dom.payrollNetPay, netPay);

  // PAYROLL TAX DEDUCTION CALCULATION - STEP 2
  // Keep the PAYE exemption helper note in sync with the current calculation.
  updatePayrollPayeTaxNote();

  // PAYROLL CALCULATION REPAIR - STEP 12A.2
  // Keep invalid calculations visibly blocked and keep Submit state accurate.
  syncPayrollCalculationValidity();
  updatePayrollSubmitButtonState();
}

function bindPayrollAutoCalculationEvents() {
  // PAYROLL CALCULATION REPAIR - STEP 12A.2
  // Only HR-controlled fields should trigger recalculation.
  // Regular calculated fields are excluded because they are populated by
  // applyAlpatechRegularRev2DerivedFields().
  const calculationFields = [
    state.dom.payrollEmployeeGroup,
    state.dom.payrollModel,
    state.dom.payrollBaseSalary,

    state.dom.regularIncrementPercent,
    state.dom.regularMeritIncrement,
    state.dom.regularBasicPercent,
    state.dom.regularHousingPercent,
    state.dom.regularTransportPercent,
    state.dom.regularUtilityPercent,
    state.dom.regularOtherAllowancePercent,

    state.dom.payrollMedicalAllowance,
    state.dom.payrollBonus,
    state.dom.payrollOvertime,
    state.dom.payrollLogisticsAllowance,
    state.dom.payrollDataAirtimeAllowance,

    state.dom.payrollPayeTax,
    state.dom.payrollWhtTax,
    state.dom.payrollOtherDeductions,
  ];

  calculationFields.forEach((field) => {
    field?.addEventListener("input", recalculatePayrollFormTotals);
    field?.addEventListener("change", recalculatePayrollFormTotals);
  });
}

function normalizePayrollGroupForPayload(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) return null;
  if (normalized === "REG" || normalized === "REGULAR") return "REGULAR";
  if (
    normalized === "CONTRACT" ||
    normalized === "TRAINER" ||
    normalized === "TRAINERS" ||
    normalized === "CONTRACT/TRAINER" ||
    normalized === "CONTRACT / TRAINER"
  ) {
    return "CONTRACT";
  }
  if (
    normalized === "SUPPORT STAFF" ||
    normalized === "SUPPORT_STAFF" ||
    normalized === "SUPPORT"
  ) {
    return "SUPPORT_STAFF";
  }
  if (normalized === "TEMP" || normalized === "TEMPORARY") return "TEMPORARY";
  if (normalized === "HVAC") return "HVAC";
  if (normalized === "OTHER") return "OTHER";

  return normalized;
}

// PAYROLL RECORDS GROUP LABELS - STEP 12C
// Convert stored payroll group codes into clean HR-facing labels.
// This is display-only and does not change saved database values.
function formatPayrollGroupDisplayLabel(value) {
  const normalizedGroup = normalizePayrollGroupForPayload(value);

  if (!normalizedGroup) return "--";

  const labels = {
    REGULAR: "Regular",
    CONTRACT: "Contract / Trainer",
    SUPPORT_STAFF: "Support Staff",
    HVAC: "HVAC",
    TEMPORARY: "Temporary",
    OTHER: "Other",
  };

  return labels[normalizedGroup] || formatStatusLabel(normalizedGroup);
}

// PAYROLL STRUCTURE PREVIEW - STEP 12D
// Format percentage values for the compact payroll rule preview.
function formatPayrollStructurePercent(field, fallbackPercent) {
  const rawValue = String(field?.value ?? "").trim();
  const numericValue = Number(rawValue);

  if (!rawValue || !Number.isFinite(numericValue)) {
    return `${fallbackPercent}%`;
  }

  return `${numericValue}%`;
}

// PAYROLL STRUCTURE PREVIEW - STEP 12D
// Return the compact HR-facing structure summary for the selected group/model.
// This is display-only; actual Regular calculations still happen in the
// existing payroll calculation functions.
function getPayrollStructurePreviewConfig() {
  const group = normalizePayrollGroupForPayload(
    state.dom.payrollEmployeeGroup?.value || "",
  );

  const model = getSelectedPayrollModel();

  if (model === "REGULAR" || group === "REGULAR") {
    return {
      title: "Regular Payroll Structure",
      badge: "Structured",
      badgeClass: "text-bg-success",
      description:
        "Regular payroll is calculated automatically from Base Salary and the configured percentage split.",
      items: [
        `Basic ${formatPayrollStructurePercent(state.dom.regularBasicPercent, 50)}`,
        `Housing ${formatPayrollStructurePercent(state.dom.regularHousingPercent, 10)}`,
        `Transport ${formatPayrollStructurePercent(state.dom.regularTransportPercent, 10)}`,
        `Utility ${formatPayrollStructurePercent(state.dom.regularUtilityPercent, 10)}`,
        `Other Allowance ${formatPayrollStructurePercent(state.dom.regularOtherAllowancePercent, 20)}`,
        "Employee Pension 8% of BHT",
        "Employer Pension 10% of BHT",
        // PAYROLL TAX DEDUCTION CALCULATION - STEP 3
// PAYE is now auto-calculated for Regular payroll.
// WHT remains manual because it is not normally applied to regular salary.
"PAYE auto-calculated • WHT manual if applicable",
      ],
    };
  }

  if (model === "CONTRACTOR" || group === "CONTRACT") {
    return {
      title: "Contract / Trainer Structure",
      badge: "Manual / Contract",
      badgeClass: "text-bg-info",
      description:
        "Contractor payroll is based on agreed contract, session, day-rate, or service amount. It does not use the Regular allowance split.",
      items: [
        "Contract amount entered manually",
        "WHT/manual deductions where applicable",
        "No Regular allowance split",
        "No pension by default unless contract terms require it",
      ],
    };
  }

  if (group === "SUPPORT_STAFF") {
    return {
      title: "Support Staff Structure",
      badge: "Policy-based",
      badgeClass: "text-bg-warning",
      description:
        "Support Staff can follow a separate internal allowance or grade policy. For now, use manual components until a dedicated rule is configured.",
      items: [
        "Salary or allowance policy applies",
        "Manual allowances allowed",
        "Deductions entered manually",
        "Dedicated rule can be configured later",
      ],
    };
  }

  if (group === "HVAC") {
    return {
      title: "HVAC Structure",
      badge: "Role-specific",
      badgeClass: "text-bg-warning",
      description:
        "HVAC payroll may include technical, site, overtime, logistics, or call-out allowances depending on policy.",
      items: [
        "Technical/site allowance may apply",
        "Overtime can be entered",
        "Logistics can be entered",
        "Deductions entered manually",
      ],
    };
  }

  if (group === "TEMPORARY") {
    return {
      title: "Temporary Staff Structure",
      badge: "Temporary",
      badgeClass: "text-bg-secondary",
      description:
        "Temporary payroll is normally short-term and simplified, using agreed temporary rate or manual pay entries.",
      items: [
        "Temporary rate/manual pay",
        "Short-term deductions only",
        "No Regular benefit split by default",
        "Review before finalising",
      ],
    };
  }

  if (group === "OTHER" || model === "GENERIC") {
    return {
      title: "Generic / Other Structure",
      badge: "Fallback",
      badgeClass: "text-bg-secondary",
      description:
        "Generic is a fallback payroll model for employees who do not yet have a defined payroll structure.",
      items: [
        "Manual payroll components",
        "No fixed percentage split",
        "Use sparingly",
        "Create a proper group rule later",
      ],
    };
  }

  return {
    title: "Payroll Structure Preview",
    badge: "Not selected",
    badgeClass: "text-bg-secondary",
    description:
      "Select an employee group to preview the payroll calculation behaviour.",
    items: ["No payroll structure selected"],
  };
}

// PAYROLL STRUCTURE PREVIEW - STEP 12D
// Render the compact preview panel without changing payroll calculations.
function renderPayrollStructurePreview() {
  const config = getPayrollStructurePreviewConfig();

  if (state.dom.payrollStructurePreviewTitle) {
    state.dom.payrollStructurePreviewTitle.textContent = config.title;
  }

  if (state.dom.payrollStructurePreviewBadge) {
    state.dom.payrollStructurePreviewBadge.textContent = config.badge;
    state.dom.payrollStructurePreviewBadge.className =
      `badge rounded-pill ${config.badgeClass}`;
  }

  if (state.dom.payrollStructurePreviewDescription) {
    state.dom.payrollStructurePreviewDescription.textContent =
      config.description;
  }

  if (state.dom.payrollStructurePreviewItems) {
    state.dom.payrollStructurePreviewItems.innerHTML = config.items
      .map(
        (item) => `
          <span class="badge rounded-pill text-bg-light border text-dark">
            ${escapeHtml(item)}
          </span>
        `,
      )
      .join("");
  }
}

function buildRegularPayrollModelFields() {
  return {
    payroll_model: "REGULAR",
    payroll_model_version: "rev2",
    structure_variant: "ALPATECH_REGULAR_REV2",
    payslip_layout: "ALPATECH_REGULAR_REV2",

    increment_percent: percentInputToDecimal(
      state.dom.regularIncrementPercent?.value,
      5,
    ),
    increment_amount: toNullableNumber(state.dom.regularIncrementAmount?.value),
    merit_increment: toNullableNumber(state.dom.regularMeritIncrement?.value),

    new_base_salary: toNullableNumber(state.dom.regularNewBaseSalary?.value),

    basic_percent: percentInputToDecimal(
      state.dom.regularBasicPercent?.value,
      50,
    ),
    housing_percent: percentInputToDecimal(
      state.dom.regularHousingPercent?.value,
      10,
    ),
    transport_percent: percentInputToDecimal(
      state.dom.regularTransportPercent?.value,
      10,
    ),
    utility_percent: percentInputToDecimal(
      state.dom.regularUtilityPercent?.value,
      10,
    ),
    other_allowance_percent: percentInputToDecimal(
      state.dom.regularOtherAllowancePercent?.value,
      20,
    ),

    bht: toNullableNumber(state.dom.regularBht?.value),
    monthly_salary_plus_logistics: toNullableNumber(
      state.dom.regularMonthlySalaryPlusLogistics?.value,
    ),
    employer_wht: null,
  };
}

function buildContractorPayrollModelFields() {
  return {
    payroll_model: "CONTRACTOR",
    payroll_model_version: "v1",
    structure_variant: "CONTRACTOR_V1",
    payslip_layout: "CONTRACTOR_V1",

    increment_percent: null,
    increment_amount: null,
    merit_increment: null,
    new_base_salary: null,

    basic_percent: null,
    housing_percent: null,
    transport_percent: null,
    utility_percent: null,
    other_allowance_percent: null,

    bht: null,
    monthly_salary_plus_logistics: null,
    employer_wht: null,
  };
}

function buildPayrollPayload() {
  const normalizedEmployeeGroup = normalizePayrollGroupForPayload(
    state.dom.payrollEmployeeGroup?.value || "",
  );

  const explicitPayrollModel = String(state.dom.payrollModel?.value || "")
    .trim()
    .toUpperCase();

  const resolvedPayrollModel =
    explicitPayrollModel ||
    (normalizedEmployeeGroup === "REGULAR"
      ? "REGULAR"
      : normalizedEmployeeGroup === "CONTRACT"
        ? "CONTRACTOR"
        : "GENERIC");

  const employeeGroupForPayload =
    normalizedEmployeeGroup ||
    (resolvedPayrollModel === "REGULAR"
      ? "REGULAR"
      : resolvedPayrollModel === "CONTRACTOR"
        ? "CONTRACT"
        : null);

  const payrollModelFields =
    resolvedPayrollModel === "REGULAR"
      ? buildRegularPayrollModelFields()
      : resolvedPayrollModel === "CONTRACTOR"
        ? buildContractorPayrollModelFields()
        : {
          payroll_model: null,
          payroll_model_version: null,
          structure_variant: null,
          payslip_layout: null,
          increment_percent: null,
          increment_amount: null,
          merit_increment: null,
          new_base_salary: null,
          basic_percent: null,
          housing_percent: null,
          transport_percent: null,
          utility_percent: null,
          other_allowance_percent: null,
          bht: null,
          monthly_salary_plus_logistics: null,
          employer_wht: null,
        };

  return {
    // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 2
    // Only include employee_id for single payroll.
    // Batch payroll will handle employee IDs in the loop later.
    ...(String(state.dom.payrollEmployeeId?.value || "").trim()
      ? { employee_id: String(state.dom.payrollEmployeeId.value).trim() }
      : {}),
    pay_cycle: String(state.dom.payrollPayCycle?.value || "").trim(),
    pay_date: state.dom.payrollPayDate?.value || null,
    employee_group: employeeGroupForPayload,
    ...payrollModelFields,

    // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 2
    // A submitted payroll should be stored as a completed/finalised payroll entry.
    // Keep "Authorised" because this is the current valid status used by the app,
    // while final completion is represented by is_finalised = true below.
    status: "Authorised",
    payroll_reference:
      String(state.dom.payrollReference?.value || "").trim() || null,

    base_salary: toNullableNumber(state.dom.payrollBaseSalary?.value),
    basic_pay: toNullableNumber(state.dom.payrollBasicPay?.value),
    housing_allowance: toNullableNumber(state.dom.payrollHousingAllowance?.value),
    transport_allowance: toNullableNumber(state.dom.payrollTransportAllowance?.value),
    utility_allowance: toNullableNumber(state.dom.payrollUtilityAllowance?.value),
    medical_allowance: toNullableNumber(state.dom.payrollMedicalAllowance?.value),
    other_allowance: toNullableNumber(state.dom.payrollOtherAllowance?.value),
    bonus: toNullableNumber(state.dom.payrollBonus?.value),
    overtime: toNullableNumber(state.dom.payrollOvertime?.value),
    logistics_allowance: toNullableNumber(state.dom.payrollLogisticsAllowance?.value),
    data_airtime_allowance: toNullableNumber(
      state.dom.payrollDataAirtimeAllowance?.value,
    ),

    gross_pay: toNullableNumber(state.dom.payrollGrossPay?.value),
    paye_tax: toNullableNumber(state.dom.payrollPayeTax?.value),
    wht_tax: toNullableNumber(state.dom.payrollWhtTax?.value),
    employee_pension: toNullableNumber(state.dom.payrollEmployeePension?.value),
    employer_pension: toNullableNumber(state.dom.payrollEmployerPension?.value),
    other_deductions: toNullableNumber(state.dom.payrollOtherDeductions?.value),
    total_deductions: toNullableNumber(state.dom.payrollTotalDeductions?.value),
    net_pay: toNullableNumber(state.dom.payrollNetPay?.value),

    currency:
      String(state.dom.payrollCurrency?.value || "NGN").trim().toUpperCase() ||
      "NGN",
    // PAYROLL BANK READINESS - STEP 11D
    // Respect the Mark as Finalised checkbox.
    // This allows payroll to be prepared as non-finalised when bank details
    // are not ready, while finalisation remains protected.
    is_finalised: Boolean(state.dom.payrollIsFinalised?.checked),
    notes: String(state.dom.payrollNotes?.value || "").trim() || null,
    processed_by: state.currentUser?.id || null,
    approved_by: Boolean(state.dom.payrollIsFinalised?.checked)
      ? state.currentUser?.id || null
      : null,
    approved_at: Boolean(state.dom.payrollIsFinalised?.checked)
      ? new Date().toISOString()
      : null,
  };
}

// HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
// Keep this existing function name because handlePayrollSave already calls it.
// Internally it now uses the shared card/header redirect behaviour.
function scrollToPayrollRecordsAfterSubmit() {
  setTimeout(() => {
    redirectToPayrollRecordsAfterSave();
  }, 250);
}
// BATCH PAYROLL DEFAULT - STEP 7
// Saves the prepared batch payroll rows into payroll_records.
// This is separate from handlePayrollSave because batch mode hides the
// individual payroll form and uses its own pay period/date controls.
async function handleBatchPayrollSubmit() {
  clearPageAlert();

  const preparedRows = state.batchPayrollPreparedRows || [];
  const payCycle = String(state.dom.batchPayrollPayCycle?.value || "").trim();
  const payDate = String(state.dom.batchPayrollPayDate?.value || "").trim();

  if (!preparedRows.length) {
    showPageAlert(
      "warning",
      "No ready employees are available for batch payroll submission.",
    );
    return;
  }

  if (!payCycle || !payDate) {
    showPageAlert(
      "warning",
      "Please select a Batch Pay Period and Batch Pay Date before submitting payroll.",
    );
    return;
  }

  const selectedEmployeeIds = Array.from(state.selectedEmployeesForPayroll || [])
    .map((employeeId) => String(employeeId || "").trim())
    .filter(Boolean);

  const readyEmployeeIds = preparedRows
    .map((row) => String(row.employee_id || "").trim())
    .filter(Boolean);

  const missingReadyRows = selectedEmployeeIds.filter(
    (employeeId) => !readyEmployeeIds.includes(employeeId),
  );

  if (missingReadyRows.length) {
    // EMPLOYEE CUSTOM ID AUTO GENERATION - STEP 1M
    // Missing Payroll Master setup is a blocking payroll issue.
    // Show it in three places:
    // 1. normal page alert for consistency,
    // 2. floating toast so HR sees it immediately,
    // 3. inline batch warning so HR does not need to scroll back to the top.
    const missingSetupMessage =
      "Some selected employees are not ready for payroll. Fix their Payroll Master setup before submitting the batch.";

    showPageAlert("warning", missingSetupMessage);

    showDashboardToast(
      "warning",
      "Batch payroll stopped",
      missingSetupMessage,
    );

    if (state.dom.batchPayrollSetupWarning) {
      state.dom.batchPayrollSetupWarning.classList.remove("d-none");
      state.dom.batchPayrollSetupWarning.innerHTML = `
        <div class="fw-semibold mb-1">Batch payroll stopped</div>
        <div class="small">
          ${escapeHtml(missingSetupMessage)}
        </div>
      `;
    }

    scrollToDashboardTarget(
      state.dom.batchPayrollReviewPanel ||
        state.dom.batchPayrollSetupWarning ||
        state.dom.payrollRecordCardCollapse,
      32,
    );

    return;
  }

  // BATCH PAYROLL DEFAULT - STEP 8
  // Stop duplicate batch payroll submission for the same employee
  // and pay period before inserting new payroll_records.
  const existingPayrollRecords =
    await getExistingBatchPayrollRecordsForPeriod(payCycle, readyEmployeeIds);

  if (existingPayrollRecords.length) {
    // BATCH PAYROLL DEFAULT - STEP 9
    // Group duplicate payroll records by employee before showing the warning.
    // This prevents the same employee name from appearing repeatedly when
    // that employee already has multiple records for the selected pay period.
    const duplicateEmployeeMap = new Map();

    existingPayrollRecords.forEach((record) => {
      const employeeKey =
        String(record.employee_id || "").trim() ||
        String(record.work_email || "").trim() ||
        String(record.id || "").trim();

      if (!employeeKey) return;

      const employeeName =
        `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
        record.work_email ||
        "Unknown Employee";

      const existingEntry = duplicateEmployeeMap.get(employeeKey);

      duplicateEmployeeMap.set(employeeKey, {
        name: employeeName,
        recordCount: (existingEntry?.recordCount || 0) + 1,
      });
    });

    const duplicateEmployees = Array.from(duplicateEmployeeMap.values());

    const affectedEmployeeText = duplicateEmployees
      .slice(0, 5)
      .map((employee) => {
        const recordLabel =
          employee.recordCount === 1
            ? "1 existing record"
            : `${employee.recordCount} existing records`;

        return `${employee.name} (${recordLabel})`;
      });

    const extraEmployeeCount =
      duplicateEmployees.length - affectedEmployeeText.length;

    // BATCH PAYROLL DEFAULT - STEP 10A
    // Give HR a clear next action when duplicate payroll is blocked.
    // The system must not overwrite or create duplicate payroll records.
    const duplicateWarningMessage = `Batch payroll stopped because ${duplicateEmployees.length} selected employee(s) already have payroll record(s) for <strong>${escapeHtml(
      payCycle,
    )}</strong>. Affected: <strong>${escapeHtml(
      affectedEmployeeText.join(", "),
    )}${extraEmployeeCount > 0 ? `, and ${extraEmployeeCount} more` : ""}</strong>. Next action: change the Pay Period, remove the affected employee from this batch, or review the existing Payroll Record before submitting again.`;

    showPageAlert("warning", duplicateWarningMessage);

    showDashboardToast(
      "warning",
      "Batch payroll stopped",
      duplicateWarningMessage,
    );

    return;
  }

  try {
    setBatchPayrollSubmitLoading(true);

    const batchPayload = preparedRows.map((preparedRow) =>
      buildBatchPayrollRecordPayload(preparedRow),
    );

    const supabase = getSupabaseClient();

    const response = await supabase
      .from("payroll_records")
      .insert(batchPayload)
      .select("*");

    if (response.error) {
      throw new Error(response.error.message);
    }

    state.lastSavedPayrollRecordIds = new Set(
      (response.data || [])
        .map((record) => String(record.id || "").trim())
        .filter(Boolean),
    );

    clearPayrollRecordsFiltersBeforeRedirect();

    await refreshPayrollWorkspace();

    // BATCH PAYROLL DEFAULT - STEP 8B
    // Keep the normal green page alert, but also show a bottom-right success
    // toast so HR sees the confirmation immediately after batch submission.
    const batchSubmitSuccessMessage = `${batchPayload.length} payroll record(s) for <strong>${escapeHtml(
      payCycle,
    )}</strong> were submitted successfully.`;

    showPageAlert("success", batchSubmitSuccessMessage);

    showDashboardToast(
      "success",
      "Batch payroll submitted",
      batchSubmitSuccessMessage,
    );

    // BATCH PAYROLL DEFAULT - STEP 7
    // Clear the batch working state after a successful submit so the same
    // employees are not accidentally submitted twice.
    state.selectedEmployeesForPayroll.clear();
    state.batchPayrollPreparedRows = [];
    state.isRunPayrollSelectionMode = false;

    syncSelectAllEmployeesForPayrollCheckbox();
    resetPayrollForm();

    scrollToPayrollRecordsAfterSubmit();
  } catch (error) {
    console.error("Error submitting batch payroll:", error);
    showPageAlert(
      "danger",
      error.message ||
      "Batch payroll could not be submitted. Please check payroll record permissions and required fields.",
    );
  } finally {
    setBatchPayrollSubmitLoading(false);
    updateSubmitBatchPayrollButtonState();
  }
}
async function handlePayrollSave() {
  clearPageAlert();
  recalculatePayrollFormTotals();

  if (!validatePayrollForm()) {
    showPageAlert(
      "warning",
      "Please complete all required payroll fields before saving.",
    );
    return;
  }

  const editingId = String(state.dom.editingPayrollId?.value || "").trim();
  const isEditMode = Boolean(editingId);

  // PAYROLL BANK READINESS - STEP 11D
  // Work out which employee records are included in this payroll save.
  // Single payroll uses the Employee dropdown.
  // Batch payroll uses the checked employees from the Full Employee List.
  const selectedBatchEmployeeIds = Array.from(
    state.selectedEmployeesForPayroll || [],
  ).filter(Boolean);

  const selectedSingleEmployeeId = String(
    state.dom.payrollEmployeeId?.value || "",
  ).trim();

  const isBatchPayrollSubmission =
    selectedBatchEmployeeIds.length > 1 &&
    !selectedSingleEmployeeId &&
    !isEditMode;

  const employeeIdsForThisPayrollSave = isBatchPayrollSubmission
    ? selectedBatchEmployeeIds
    : [selectedSingleEmployeeId].filter(Boolean);

  // PAYROLL BANK READINESS - STEP 11D
  // Block only finalisation when active bank details are missing.
  // If Mark as Finalised is unticked, payroll can still be prepared/saved.
  if (!validatePayrollFinalisationBankReadiness(employeeIdsForThisPayrollSave)) {
    return;
  }

  let payrollPayload = null;

  try {
    setPayrollSaveLoading(true, isEditMode);

    payrollPayload = buildPayrollPayload();

    const supabase = getSupabaseClient();
    let response;

    // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 3
    // Batch payroll: when multiple employees were selected from the Full Employee List,
    // create one payroll record for each selected employee.
    // PAYROLL BANK READINESS - STEP 11D
    // selectedBatchEmployeeIds and isBatchPayrollSubmission are now calculated
    // before the save starts, so finalisation readiness can be checked first.

    if (isBatchPayrollSubmission) {
      const batchPayload = selectedBatchEmployeeIds.map((employeeId) => ({
        ...payrollPayload,
        employee_id: employeeId,
      }));

      response = await supabase
        .from("payroll_records")
        .insert(batchPayload)
        .select("*");

      if (response.error) {
        throw new Error(response.error.message);
      }

      // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
      // Remember the batch records just created so they appear first.
      state.lastSavedPayrollRecordIds = new Set(
        (response.data || [])
          .map((record) => String(record.id || "").trim())
          .filter(Boolean),
      );

      // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
      // Clear filters before refresh so the batch records are visible.
      clearPayrollRecordsFiltersBeforeRedirect();

      await refreshPayrollWorkspace();

      showPageAlert(
        "success",
        `${selectedBatchEmployeeIds.length} payroll records for <strong>${escapeHtml(
          payrollPayload.pay_cycle,
        )}</strong> were created successfully.`,
      );

      resetPayrollForm();

      // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - BATCH CLEANUP
      // Clear selected employees after a successful batch payroll run.
      state.selectedEmployeesForPayroll.clear();
      syncSelectAllEmployeesForPayrollCheckbox();

      // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - SCROLL FIX FINAL
      // After batch submit, move HR to Payroll Records to confirm created records.
      scrollToPayrollRecordsAfterSubmit();

      return;
    }

    if (isEditMode) {
      response = await supabase
        .from("payroll_records")
        .update(payrollPayload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle();
    } else {
      response = await supabase
        .from("payroll_records")
        .insert([payrollPayload])
        .select("*")
        .maybeSingle();
    }

    if (response.error) {
      throw new Error(response.error.message);
    }

    // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
    // Remember the payroll record just created/updated so it appears first.
    state.lastSavedPayrollRecordIds = new Set(
      [response.data?.id || editingId]
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );

    // HR SAVE/EDIT BEHAVIOUR - PAYROLL RECORDS STEP 5
    // Clear filters before refresh so the saved/updated record is visible.
    clearPayrollRecordsFiltersBeforeRedirect();

    await refreshPayrollWorkspace();

    showPageAlert(
      "success",
      isEditMode
        ? `Payroll record for <strong>${escapeHtml(payrollPayload.pay_cycle)}</strong> was updated successfully.`
        : `Payroll record for <strong>${escapeHtml(payrollPayload.pay_cycle)}</strong> was created successfully.`,
    );

    resetPayrollForm();

    // SUBMIT PAYROLL - DESCRIPTION ITEM 2 - SCROLL FIX FINAL
    // After successful single payroll submit/update, move HR to Payroll Records.
    scrollToPayrollRecordsAfterSubmit();
  } catch (error) {
    console.error("Error saving payroll record:", error);
    showPageAlert(
      "danger",
      error.message ||
      "Payroll record could not be saved. Check payroll_records RLS policy and required columns.",
    );
  } finally {
    setPayrollSaveLoading(false, isEditMode);
  }
}
// BATCH PAYROLL DEFAULT - STEP 7
// Shows a spinner only on the Submit Batch Payroll button.
// This avoids interfering with the hidden individual payroll form buttons.
function setBatchPayrollSubmitLoading(isLoading) {
  const button = state.dom.submitBatchPayrollBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Submitting Batch...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}
function setPayrollSaveLoading(isLoading, isEditMode = false) {
  // EMERGENCY PAYROLL SPINNER REPAIR
  // The top Submit Payroll button and the bottom Submit Payroll button
  // submit the same form, so both must show the same loading state.
  const buttons = [
    state.dom.savePayrollBtn,
    state.dom.topSubmitPayrollBtn,
  ].filter(Boolean);

  if (!buttons.length) return;

  const loadingText = isEditMode ? "Updating Payroll..." : "Saving Payroll...";

  buttons.forEach((button) => {
    if (isLoading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }

      button.disabled = true;
      button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
        ${loadingText}
      `;
      return;
    }

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  });

  if (!isLoading) {
    state.dom.savePayrollBtnText = document.getElementById("savePayrollBtnText");

    // Restore the correct grey/blue state after the spinner is removed.
    updatePayrollSubmitButtonState();
  }
}