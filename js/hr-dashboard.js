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

    window.hrOpenEmployeeDocument = async (documentId) => {
      await openEmployeeDocument(documentId);
    };

    window.hrEditPayrollRecord = (payrollId) => {
      startPayrollEdit(payrollId);
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

  payrollRecords: [],
  filteredPayrollRecords: [],

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
    lastName: document.getElementById("lastName"),
    workEmail: document.getElementById("workEmail"),
    phoneNumber: document.getElementById("phoneNumber"),
    department: document.getElementById("department"),
    jobTitle: document.getElementById("jobTitle"),

    // DESCRIPTION ITEM 5 - STEP 2
    // Grade level is now captured from the HR employee form.
    gradeLevel: document.getElementById("gradeLevel"),

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

    payrollRecordCountValue: document.getElementById("payrollRecordCountValue"),
    payrollFinalisedCountValue: document.getElementById("payrollFinalisedCountValue"),
    payrollGrossTotalValue: document.getElementById("payrollGrossTotalValue"),
    payrollNetTotalValue: document.getElementById("payrollNetTotalValue"),

    payrollSearchInput: document.getElementById("payrollSearchInput"),
    payrollStatusFilter: document.getElementById("payrollStatusFilter"),
    refreshPayrollRecordsBtn: document.getElementById("refreshPayrollRecordsBtn"),
    payrollRecordsEmptyState: document.getElementById("payrollRecordsEmptyState"),
    payrollRecordsTableWrapper: document.getElementById("payrollRecordsTableWrapper"),
    payrollRecordsTableBody: document.getElementById("payrollRecordsTableBody"),
// SUBMIT PAYROLL - DESCRIPTION ITEM 2
// Stable Payroll Records card target used after successful submit.
payrollRecordsCard: document.getElementById("payrollRecordsCard"),
    // =========================================================
    // DESCRIPTION ITEM 1
    // Payroll master form DOM cache
    // These fields belong to the new payroll master data section.
    // =========================================================
    payrollMasterCreateForm: document.getElementById("payrollMasterCreateForm"),

    // DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 3
    // Collapse controls for the Payroll Master Data card.
    togglePayrollMasterCardBtn: document.getElementById("togglePayrollMasterCardBtn"),
    payrollMasterCardCollapse: document.getElementById("payrollMasterCardCollapse"),

    payrollMasterFormModeBadge: document.getElementById("payrollMasterFormModeBadge"),
    editingPayrollMasterId: document.getElementById("editingPayrollMasterId"),
    cancelPayrollMasterEditBtn: document.getElementById("cancelPayrollMasterEditBtn"),
    resetPayrollMasterFormBtn: document.getElementById("resetPayrollMasterFormBtn"),
    refreshPayrollMasterRecordsBtn: document.getElementById("refreshPayrollMasterRecordsBtn"),
    savePayrollMasterBtn: document.getElementById("savePayrollMasterBtn"),
    savePayrollMasterBtnText: document.getElementById("savePayrollMasterBtnText"),

    payrollMasterEmployeeId: document.getElementById("payrollMasterEmployeeId"),
    payrollMasterGrade: document.getElementById("payrollMasterGrade"),
    payrollMasterBasicSalary: document.getElementById("payrollMasterBasicSalary"),
    payrollMasterEffectiveDate: document.getElementById("payrollMasterEffectiveDate"),
    payrollMasterPayCycle: document.getElementById("payrollMasterPayCycle"),
    payrollMasterStatus: document.getElementById("payrollMasterStatus"),
    payrollMasterNotes: document.getElementById("payrollMasterNotes"),

    payrollMasterSearchInput: document.getElementById("payrollMasterSearchInput"),
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
    payrollWhtTax: document.getElementById("payrollWhtTax"),
    payrollEmployeePension: document.getElementById("payrollEmployeePension"),
    payrollEmployerPension: document.getElementById("payrollEmployerPension"),
    payrollOtherDeductions: document.getElementById("payrollOtherDeductions"),
    payrollTotalDeductions: document.getElementById("payrollTotalDeductions"),
    payrollNetPay: document.getElementById("payrollNetPay"),
    payrollCurrency: document.getElementById("payrollCurrency"),
    payrollIsFinalised: document.getElementById("payrollIsFinalised"),
    payrollNotes: document.getElementById("payrollNotes"),
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
function bindEvents() {
  state.dom.logoutBtn?.addEventListener("click", async () => {
    await window.SessionManager.logoutUser("logout");
  });

  state.dom.hrTabProfileBtn?.addEventListener("click", () => {
    switchHrWorkspace("profile");
  });

  state.dom.hrTabEmployeesBtn?.addEventListener("click", () => {
    switchHrWorkspace("employees");
  });

  state.dom.hrTabPayrollBtn?.addEventListener("click", () => {
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

  const requiredFields = [
    state.dom.payrollMasterEmployeeId,
    state.dom.payrollMasterGrade,
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
    grade: String(state.dom.payrollMasterGrade?.value || "").trim(),
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

resetPayrollMasterForm();

// PAYROLL MASTER REDIRECT - STEP 1A
// After creating or updating payroll master data, move HR back to the
// Payroll Master Records heading area, not just the table, so the heading
// remains visible and the section does not look cut off.
setTimeout(() => {
  const target =
    state.dom.payrollMasterRecordsTableWrapper?.closest(".card-body") ||
    state.dom.payrollMasterRecordsTableWrapper;

  if (!target) return;

  const targetTop = target.getBoundingClientRect().top + window.scrollY - 24;

  window.scrollTo({
    top: targetTop,
    behavior: "smooth",
  });
}, 350);
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

  // Clear validation styling when returning to create mode.
  const fieldsToReset = [
    state.dom.payrollMasterEmployeeId,
    state.dom.payrollMasterGrade,
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

  state.dom.payrollMasterRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center text-secondary py-4">
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

  records.forEach((record) => {
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

  <td>${escapeHtml(record.grade || "--")}</td>

  <td class="text-nowrap">
    <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 6
         Keep salary on one line for a cleaner payroll master table. -->
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

  if (state.dom.payrollMasterGrade) {
    state.dom.payrollMasterGrade.value = record.grade || "";
  }

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

  state.dom.payrollMasterCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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

  records.forEach((record) => {
    const option = document.createElement("option");
    const fullName =
      `${record.first_name || ""} ${record.last_name || ""}`.trim() ||
      record.work_email ||
      "Unknown Employee";

    option.value = record.id;
    option.textContent = `${fullName} — ${record.grade || "--"} — ${record.salary_effective_date || "--"}`;
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
      const searchableText = [
        record.first_name,
        record.last_name,
        record.grade,
        record.pay_cycle,
        record.payroll_status,
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

    resetPayrollAllowanceForm();
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

  records.forEach((record) => {
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

  state.dom.payrollAllowanceCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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

// RUN PAYROLL - STEP 4
// Moves HR from employee selection into the payroll form area.
// This does not create payroll records yet; it only starts the next stage
// of the guided payroll workflow.
function continueRunPayrollToPayrollWorkspace() {
  const selectedEmployeeIds = Array.from(state.selectedEmployeesForPayroll || []);

  if (!selectedEmployeeIds.length) {
    showPageAlert(
      "warning",
      "Please select at least one employee before continuing to payroll.",
    );
    return;
  }

  switchHrWorkspace("payroll");

// RUN PAYROLL - STEP 5
// If HR selected exactly one employee, prefill the payroll employee field
// and refresh the read-only employee reference panel. If multiple employees
// are selected, do not guess; batch handling will be added separately.
if (selectedEmployeeIds.length === 1 && state.dom.payrollEmployeeId) {
  // RUN PAYROLL - STEP 5
  // Single employee flow: prefill the payroll form with the selected employee.
state.dom.payrollEmployeeId.value = selectedEmployeeIds[0];
renderPayrollSelectedEmployeeReference(selectedEmployeeIds[0]);

// SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 4
// For a single selected employee, prefill salary/model fields from payroll master data.
populatePayrollFormFromEmployeeMaster(selectedEmployeeIds[0]);
} else {
  // RUN PAYROLL - STEP 6
  // Multiple employee flow: do not randomly choose one employee.
  // Keep the payroll employee field blank and notify HR that batch handling is next.
  if (state.dom.payrollEmployeeId) {
    state.dom.payrollEmployeeId.value = "";
  }

  renderPayrollSelectedEmployeeReference("");

// RUN PAYROLL - STEP 6 FIX
// Show the batch-mode message directly inside the payroll reference card,
// because the page alert may be above the current scroll position.
if (state.dom.payrollSelectedEmployeeReferenceEmptyState) {
  state.dom.payrollSelectedEmployeeReferenceEmptyState.innerHTML = `
    <strong>${selectedEmployeeIds.length} employees selected for payroll.</strong>
    <br />
    Batch payroll processing will use the selected employee list. Select a single employee only if you want to create one payroll record manually.
  `;
  state.dom.payrollSelectedEmployeeReferenceEmptyState.classList.remove("d-none");
}

if (state.dom.payrollSelectedEmployeeReferenceDetails) {
  state.dom.payrollSelectedEmployeeReferenceDetails.classList.add("d-none");
}
}

  if (state.dom.payrollRecordCardCollapse) {
    state.dom.payrollRecordCardCollapse.classList.remove("d-none");
  }

  if (state.dom.togglePayrollRecordCardBtn) {
    state.dom.togglePayrollRecordCardBtn.setAttribute("aria-expanded", "true");

    const icon = state.dom.togglePayrollRecordCardBtn.querySelector("i");
    const label = state.dom.togglePayrollRecordCardBtn.querySelector("span");

    if (icon) icon.className = "bi bi-chevron-up me-2";
    if (label) label.textContent = "Collapse";
  }

  state.dom.payrollCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// RUN PAYROLL - STEP 1
// Opens the Full Employee List as the payroll selection workspace.
// This keeps employee selection tied to the HR employee source and avoids
// creating a separate payroll-only employee list.
function startRunPayrollSelectionFlow() {
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
  // Keep both payroll dropdowns in sync with the employee list.
  // Existing payroll form uses one dropdown; payroll master uses another.
  // =========================================================
  populatePayrollEmployeeOptions();
  populatePayrollMasterEmployeeOptions();
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

  if (!searchTerm) {
    state.filteredEmployees = [...state.employees];
  } else {
    state.filteredEmployees = state.employees.filter((employee) => {
      const searchableText = [
        employee.first_name,
        employee.last_name,
        employee.work_email,
        employee.department,
        employee.job_title,

        // DESCRIPTION ITEM 5 - STEP 2
        // Allow grade level to participate in employee list search.
        employee.grade_level,

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

  employees.forEach((employee) => {
    const fullName = `${employee.first_name || ""} ${employee.last_name || ""}`.trim();
    const documentCount = documentCountMap.get(String(employee.id)) || 0;
    const accountLinkage = getEmployeeAccountLinkage(employee);

    // DESCRIPTION ITEM 5 - SYNC FOUNDATION STEP 3C
    // Let the employee list reflect payroll-linked grade information when the
    // HR employee record has not yet been updated with a grade level.
    const latestPayrollProfile = getLatestPayrollMasterProfileForEmployee(employee.id);
    const resolvedGradeLevel =
      String(employee.grade_level || "").trim() ||
      String(latestPayrollProfile?.grade || "").trim() ||
      "--";

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
  <!-- DESCRIPTION ITEM 5 - STEP 4
       Keep payroll visibility compact inside the Role cell:
       department, job title, grade, base salary, and pay cycle. -->
  <div>${escapeHtml(employee.department || "--")}</div>
  <div class="text-secondary small">
    ${escapeHtml(employee.job_title || "--")}
  </div>
  <div class="text-secondary small">
    ${escapeHtml(resolvedGradeLevel)}
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
    state.dom.lastName,
    state.dom.workEmail,
    state.dom.phoneNumber,
    state.dom.department,
    state.dom.jobTitle,

    // DESCRIPTION ITEM 5 - STEP 2
    // Clear grade level when returning the HR employee form to its default state.
    state.dom.gradeLevel,

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

  clearPageAlert();
}

function enterEmployeeEditMode(employee) {
  state.currentEditingEmployee = employee;

  if (state.dom.editingEmployeeId) state.dom.editingEmployeeId.value = employee.id || "";
  if (state.dom.firstName) state.dom.firstName.value = employee.first_name || "";
  if (state.dom.lastName) state.dom.lastName.value = employee.last_name || "";
  if (state.dom.workEmail) state.dom.workEmail.value = employee.work_email || "";
  if (state.dom.phoneNumber) state.dom.phoneNumber.value = employee.phone_number || "";
  if (state.dom.department) state.dom.department.value = employee.department || "";
  if (state.dom.jobTitle) state.dom.jobTitle.value = employee.job_title || "";

  // DESCRIPTION ITEM 5 - STEP 2
  // Load the saved grade level back into the HR employee form during edit.
  if (state.dom.gradeLevel) state.dom.gradeLevel.value = employee.grade_level || "";

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
  void loadEmployeeDocuments(employee.id);

  state.dom.employeeCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start",
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

  const requiredFields = [
    state.dom.firstName,
    state.dom.lastName,
    state.dom.workEmail,
    state.dom.department,
    state.dom.jobTitle,
    state.dom.lineManager,
    state.dom.employmentDate,
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
    last_name: String(state.dom.lastName?.value || "").trim(),
    work_email: String(state.dom.workEmail?.value || "")
      .trim()
      .toLowerCase(),
    phone_number: String(state.dom.phoneNumber?.value || "").trim() || null,
    department: String(state.dom.department?.value || "").trim(),
    job_title: String(state.dom.jobTitle?.value || "").trim(),

    // DESCRIPTION ITEM 5 - STEP 2
    // Persist grade level in the HR employee source.
    grade_level: String(state.dom.gradeLevel?.value || "").trim() || null,

    line_manager: String(state.dom.lineManager?.value || "").trim(),
    employment_date: state.dom.employmentDate?.value || null,
    approver_email: approverEmail || null,
    employee_number:
      String(state.dom.employeeNumber?.value || "").trim() || null,
    status: normalizeText(rawStatus) || "active",
  };
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

      <button
        type="button"
        class="btn btn-sm btn-outline-primary"
        data-open-document-id="${escapeHtml(documentRow.id)}"
      >
        Open
      </button>
    `;

    const openButton = item.querySelector("[data-open-document-id]");
    openButton?.addEventListener("click", async () => {
      await openEmployeeDocument(documentRow.id);
    });

    list.appendChild(item);
  });
}

async function openEmployeeDocument(documentId) {
  const supabase = getSupabaseClient();

  try {
    const documentRow = state.attachedDocuments.find(
      (item) => String(item.id) === String(documentId),
    );

    if (!documentRow?.file_path) {
      throw new Error("The selected document could not be resolved.");
    }

    const { data, error } = await supabase.storage
      .from(EMPLOYEE_DOCUMENTS_BUCKET)
      .createSignedUrl(documentRow.file_path, 60);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error("A secure document link could not be generated.");
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Error opening employee document:", error);
    showPageAlert(
      "warning",
      error.message || "The selected document could not be opened.",
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

    const supabase = getSupabaseClient();
    let savedEmployeeId = editingId;
    let savedEmployeeName = `${employeePayload.first_name} ${employeePayload.last_name}`.trim();

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
      savedEmployeeName = `${data.first_name || employeePayload.first_name} ${data.last_name || employeePayload.last_name}`.trim();
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
      savedEmployeeName = `${data.first_name || employeePayload.first_name} ${data.last_name || employeePayload.last_name}`.trim();
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

    // DESCRIPTION ITEM 5 - SYNC FOUNDATION STEP 3B
    // Keep the payroll side in sync with the HR employee source immediately
    // after an employee create/update, so both payroll selectors and the
    // read-only payroll reference panel reflect the latest employee data.
    populatePayrollEmployeeOptions();
    populatePayrollMasterEmployeeOptions();
    renderPayrollSelectedEmployeeReference(
      state.dom.payrollEmployeeId?.value || "",
    );

    showPageAlert(
      "success",
      isEditMode
        ? `Employee profile for <strong>${escapeHtml(
          savedEmployeeName,
        )}</strong> was updated successfully.`
        : `Employee profile for <strong>${escapeHtml(
          savedEmployeeName,
        )}</strong> was created successfully.`,
    );

    resetEmployeeForm();

    if (isEditMode) {
      const refreshedEmployee = state.employees.find(
        (item) => String(item.id) === String(savedEmployeeId),
      );

      if (refreshedEmployee) {
        enterEmployeeEditMode(refreshedEmployee);
      }
    } else {
      resetEmployeeForm();
    }
  } catch (error) {
    console.error("Error saving employee profile:", error);
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

function applyPayrollSearch() {
  const searchTerm = normalizeText(state.dom.payrollSearchInput?.value || "");
  const statusFilter = normalizeText(state.dom.payrollStatusFilter?.value || "");

  let rows = [...state.payrollRecords];

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

  records.forEach((record) => {
    const fullName = `${record.first_name || ""} ${record.last_name || ""}`.trim();

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
        <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 8B
             Keep payroll grouping and cycle together in one compact cell. -->
        <div class="fw-semibold">${escapeHtml(record.employee_group || "--")}</div>
        <div class="text-secondary small">
          ${escapeHtml(record.pay_cycle || "--")}
        </div>
      </td>

<td class="align-middle">
  <!-- DATE = primary payroll value -->
  <div class="fw-medium">${formatDate(record.pay_date)}</div>

  <!-- TIMESTAMP = audit metadata (visually separated) -->
  <div class="text-secondary small" style="margin-top: 4px;">
    Submitted: ${new Date(record.updated_at || record.created_at).toLocaleTimeString(undefined, {
  hour: "2-digit",
  minute: "2-digit",
})}
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
        <!-- DESCRIPTION ITEM 2 - UI ALIGNMENT STEP 8B
             Keep a compact icon-only edit action in the final column. -->
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          title="Edit payroll record"
          aria-label="Edit payroll record"
          onclick="window.hrEditPayrollRecord('${String(record.id).replaceAll("'", "\\'")}')"
        >
          <i class="bi bi-pencil-square"></i>
        </button>
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
  state.dom.payrollCreateForm?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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
  return (
    toNullableNumber(state.dom.payrollPayeTax?.value) +
    toNullableNumber(state.dom.payrollWhtTax?.value) +
    toNullableNumber(state.dom.payrollEmployeePension?.value) +
    toNullableNumber(state.dom.payrollOtherDeductions?.value)
  );
}

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

  return "GENERIC";
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
  if (isAlpatechRegularSelected()) {
    applyAlpatechRegularRev2DerivedFields();
  }

  const grossPay = calculatePayrollGrossPay();
  const totalDeductions = calculatePayrollTotalDeductions();
  const netPay = grossPay - totalDeductions;

  setNumericFieldValue(state.dom.payrollGrossPay, grossPay);
  setNumericFieldValue(state.dom.payrollTotalDeductions, totalDeductions);
  setNumericFieldValue(state.dom.payrollNetPay, netPay);
}

function bindPayrollAutoCalculationEvents() {
  const calculationFields = [
    state.dom.payrollEmployeeGroup,
    state.dom.payrollBaseSalary,
    state.dom.regularIncrementPercent,
    state.dom.regularMeritIncrement,
    state.dom.regularBasicPercent,
    state.dom.regularHousingPercent,
    state.dom.regularTransportPercent,
    state.dom.regularUtilityPercent,
    state.dom.regularOtherAllowancePercent,

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

    state.dom.payrollPayeTax,
    state.dom.payrollWhtTax,
    state.dom.payrollEmployeePension,
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
    // SUBMIT PAYROLL - DESCRIPTION ITEM 1 - STEP 2
// Force submitted payroll entries to be finalised/completed at save time.
is_finalised: true,
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

// SUBMIT PAYROLL - DESCRIPTION ITEM 2 - SCROLL FIX FINAL
// Reliably move HR to Payroll Records after submit.
// Uses window.scrollTo because scrollIntoView was not consistently moving
// after the payroll form reset/re-render cycle.
function scrollToPayrollRecordsAfterSubmit() {
  setTimeout(() => {
    const target =
      document.getElementById("payrollRecordsCard") ||
      state.dom.payrollRecordsCard ||
      state.dom.payrollRecordsTableWrapper;

    if (!target) return;

    const targetTop =
      target.getBoundingClientRect().top + window.scrollY - 24;

    window.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }, 600);
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
  let payrollPayload = null;

  try {
    setPayrollSaveLoading(true, isEditMode);

payrollPayload = buildPayrollPayload();

const supabase = getSupabaseClient();
let response;

// SUBMIT PAYROLL - DESCRIPTION ITEM 2 - STEP 3
// Batch payroll: when multiple employees were selected from the Full Employee List,
// create one completed payroll record for each selected employee.
const selectedBatchEmployeeIds = Array.from(
  state.selectedEmployeesForPayroll || [],
).filter(Boolean);

const isBatchPayrollSubmission =
  selectedBatchEmployeeIds.length > 1 &&
  !String(state.dom.payrollEmployeeId?.value || "").trim() &&
  !isEditMode;

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

function setPayrollSaveLoading(isLoading, isEditMode = false) {
  const button = state.dom.savePayrollBtn;
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      ${isEditMode ? "Updating Payroll..." : "Saving Payroll..."}
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.savePayrollBtnText = document.getElementById("savePayrollBtnText");
  }
}