/* =========================================================
   employee-dashboard.js
========================================================= */

const PROFILE_IMAGES_BUCKET = "profile-images";
const PAYROLL_MODEL_GENERIC = "GENERIC";
const PAYROLL_MODEL_REGULAR = "REGULAR";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    cacheDomElements();
    bindNavigationEvents();
    bindLeaveFormEvents();
    bindUtilityEvents();
    bindPayrollFilterEvents();
    bindProfileImageEvents();
    bindSyncEvents();

    const authResult = await window.SessionManager.protectPage("employee");
    if (!authResult) return;

    state.currentUser = authResult.session.user;
    state.currentProfile = authResult.profile;

    await loadLatestEmployeeProfile();

    if (state.dom.employeeDisplayEmail) {
      state.dom.employeeDisplayEmail.textContent =
        state.currentProfile?.email ||
        authResult.profile?.email ||
        authResult.session.user.email ||
        "No email";
    }

    if (state.dom.heroRoleValue) {
      state.dom.heroRoleValue.textContent = String(
        state.currentProfile?.role || authResult.profile?.role || "employee",
      ).toLowerCase();
    }

    await loadEmployeeRecord(
      authResult.session.user.id,
      authResult.session.user.email,
    );

    await renderEmployeeProfileImage();
    await loadEmployeeLeaveBalances();
    await loadLeaveTypes();
    await loadEmployeeLeaveRequests();
    await loadEmployeePayroll();

    showSection("profile");
    startLeaveAutoRefresh();
  } catch (error) {
    console.error("Error initialising employee dashboard:", error);
    showPageAlert(
      "danger",
      error.message ||
      "An unexpected error occurred while loading the employee dashboard.",
    );
  }
});

const state = {
  currentUser: null,
  currentProfile: null,
  employeeRecord: null,
  payrollRecords: [],
  leaveRefreshTimer: null,
  pendingProfileImageFile: null,
  identity: {
    authUserId: null,
    employeeRowId: null,
    linkedUserId: null,
  },
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

/* =========================================================
   Identity helpers
========================================================= */
function getEmployeeIdentityCandidates() {
  const candidates = [
    state.identity?.linkedUserId,
    state.identity?.authUserId,
    state.identity?.employeeRowId,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function getPreferredEmployeeReferenceId() {
  return (
    state.identity?.linkedUserId ||
    state.identity?.authUserId ||
    state.identity?.employeeRowId ||
    null
  );
}

/* =========================================================
   Safe user_id backfill
========================================================= */
async function tryBackfillEmployeeUserId(employee, authUserId, authUserEmail) {
  const supabase = getSupabaseClient();

  if (!employee?.id || !authUserId) {
    return { employee, status: "skipped" };
  }

  if (employee.user_id === authUserId) {
    return { employee, status: "already-linked" };
  }

  const employeeEmail = normalizeEmail(employee.work_email || employee.email);
  const signedInEmail = normalizeEmail(authUserEmail);

  if (!employeeEmail || !signedInEmail || employeeEmail !== signedInEmail) {
    return { employee, status: "email-mismatch" };
  }

  if (employee.user_id) {
    return { employee, status: "different-user-id-present" };
  }

  try {
    const { data, error } = await supabase
      .from("employees")
      .update({ user_id: authUserId })
      .eq("id", employee.id)
      .is("user_id", null)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Unable to backfill employees.user_id:", error);
      return { employee, status: "failed", error };
    }

    if (data) {
      return { employee: data, status: "linked" };
    }

    return {
      employee: { ...employee, user_id: authUserId },
      status: "linked-no-row-returned",
    };
  } catch (error) {
    console.error("Unexpected employees.user_id backfill error:", error);
    return { employee, status: "failed", error };
  }
}

function applyResolvedIdentity(employee) {
  state.identity = {
    authUserId: state.currentUser?.id || null,
    employeeRowId: employee?.id || null,
    linkedUserId: employee?.user_id || state.currentUser?.id || null,
  };
}

function cacheDomElements() {
  state.dom = {
    pageAlert: document.getElementById("pageAlert"),

    navProfileBtn: document.getElementById("navProfileBtn"),
    navLeaveBtn: document.getElementById("navLeaveBtn"),
    navPayrollBtn: document.getElementById("navPayrollBtn"),
    logoutBtn: document.getElementById("logoutBtn"),

    profileSection: document.getElementById("profileSection"),
    leaveSection: document.getElementById("leaveSection"),
    payrollSection: document.getElementById("payrollSection"),

    employeeDisplayEmail: document.getElementById("employeeDisplayEmail"),
    employeeInitials: document.getElementById("employeeInitials"),
    employeeHeroImage: document.getElementById("employeeHeroImage"),
    heroRoleValue: document.getElementById("heroRoleValue"),
    heroModuleValue: document.getElementById("heroModuleValue"),

    profileImage: document.getElementById("profileImage"),
    profileImageInput: document.getElementById("profileImageInput"),
    saveProfileImageBtn: document.getElementById("saveProfileImageBtn"),
    profileFullName: document.getElementById("profileFullName"),
    profileJobTitle: document.getElementById("profileJobTitle"),
    profileDepartment: document.getElementById("profileDepartment"),
    profileEmployeeId: document.getElementById("profileEmployeeId"),

    firstName: document.getElementById("firstName"),
    lastName: document.getElementById("lastName"),
    emailAddress: document.getElementById("emailAddress"),
    phoneNumber: document.getElementById("phoneNumber"),
    roleName: document.getElementById("roleName"),
    managerName: document.getElementById("managerName"),

    leaveBalancesEmptyState: document.getElementById("leaveBalancesEmptyState"),
    leaveBalancesGrid: document.getElementById("leaveBalancesGrid"),
    refreshLeaveBalancesBtn: document.getElementById("refreshLeaveBalancesBtn"),

    latestDecisionEmptyState: document.getElementById(
      "latestDecisionEmptyState",
    ),
    latestDecisionCard: document.getElementById("latestDecisionCard"),
    latestDecisionStatus: document.getElementById("latestDecisionStatus"),
    latestDecisionLeaveType: document.getElementById("latestDecisionLeaveType"),
    latestDecisionDateTime: document.getElementById("latestDecisionDateTime"),
    latestDecisionPeriod: document.getElementById("latestDecisionPeriod"),
    latestDecisionBy: document.getElementById("latestDecisionBy"),
    latestDecisionComment: document.getElementById("latestDecisionComment"),

    leaveRequestForm: document.getElementById("leaveRequestForm"),
    leaveType: document.getElementById("leaveType"),
    startDate: document.getElementById("startDate"),
    endDate: document.getElementById("endDate"),
    totalDays: document.getElementById("totalDays"),
    leaveReason: document.getElementById("leaveReason"),
    submitLeaveBtn: document.getElementById("submitLeaveBtn"),

    refreshLeaveRequestsBtn: document.getElementById("refreshLeaveRequestsBtn"),
    leaveRequestsEmptyState: document.getElementById("leaveRequestsEmptyState"),
    leaveRequestsTableWrapper: document.getElementById(
      "leaveRequestsTableWrapper",
    ),
    leaveRequestsTableBody: document.getElementById("leaveRequestsTableBody"),

    refreshPayrollBtn: document.getElementById("refreshPayrollBtn"),
    currentPayrollEmptyState: document.getElementById(
      "currentPayrollEmptyState",
    ),
    currentPayrollSummaryGrid: document.getElementById(
      "currentPayrollSummaryGrid",
    ),
    currentPayCycle: document.getElementById("currentPayCycle"),
    currentGrossPay: document.getElementById("currentGrossPay"),
    currentTotalDeductions: document.getElementById("currentTotalDeductions"),
    currentNetPay: document.getElementById("currentNetPay"),
    payrollHistoryEmptyState: document.getElementById(
      "payrollHistoryEmptyState",
    ),
    payrollHistoryTableWrapper: document.getElementById(
      "payrollHistoryTableWrapper",
    ),
    payrollHistoryTableBody: document.getElementById("payrollHistoryTableBody"),
    payrollSearchInput: document.getElementById("payrollSearchInput"),
    payrollDateFromInput: document.getElementById("payrollDateFromInput"),
    payrollDateToInput: document.getElementById("payrollDateToInput"),
    clearPayrollFiltersBtn: document.getElementById("clearPayrollFiltersBtn"),
  };
}

function bindNavigationEvents() {
  state.dom.navProfileBtn?.addEventListener("click", () =>
    showSection("profile"),
  );
  state.dom.navLeaveBtn?.addEventListener("click", () => showSection("leave"));
  state.dom.navPayrollBtn?.addEventListener("click", () =>
    showSection("payroll"),
  );
}

function bindUtilityEvents() {
  state.dom.logoutBtn?.addEventListener("click", async () => {
    await window.SessionManager.logoutUser("logout");
  });

  state.dom.refreshLeaveBalancesBtn?.addEventListener("click", async () => {
    await refreshEmployeeLeaveBalancesManually();
  });

  state.dom.refreshLeaveRequestsBtn?.addEventListener("click", async () => {
    await refreshEmployeeLeaveHistoryManually();
  });

  state.dom.refreshPayrollBtn?.addEventListener("click", async () => {
    await refreshEmployeePayrollManually();
  });
}
function bindPayrollFilterEvents() {
  state.dom.payrollSearchInput?.addEventListener("input", () => {
    applyPayrollFilters();
  });

  state.dom.payrollDateFromInput?.addEventListener("change", () => {
    applyPayrollFilters();
  });

  state.dom.payrollDateToInput?.addEventListener("change", () => {
    applyPayrollFilters();
  });

  state.dom.clearPayrollFiltersBtn?.addEventListener("click", () => {
    clearPayrollFilters();
  });
}
function bindProfileImageEvents() {
  state.dom.profileImageInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;
    handlePendingProfileImage(file);
  });

  state.dom.saveProfileImageBtn?.addEventListener("click", async () => {
    await uploadEmployeeProfileImage();
  });
}

function bindSyncEvents() {
  window.addEventListener("storage", async (event) => {
    if (event.key !== "hrPayrollLeaveDecisionSync") return;
    await refreshEmployeeLeaveViewsSilently();
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      await refreshEmployeeLeaveViewsSilently();
    }
  });
}

function startLeaveAutoRefresh() {
  stopLeaveAutoRefresh();

  state.leaveRefreshTimer = window.setInterval(async () => {
    if (document.visibilityState !== "visible") return;
    await refreshEmployeeLeaveViewsSilently();
  }, 10000);
}

function stopLeaveAutoRefresh() {
  if (state.leaveRefreshTimer) {
    window.clearInterval(state.leaveRefreshTimer);
    state.leaveRefreshTimer = null;
  }
}

async function refreshEmployeeLeaveViewsSilently() {
  try {
    await loadEmployeeLeaveRequests();
    await loadEmployeeLeaveBalances();
  } catch (error) {
    console.warn("Silent leave refresh failed:", error);
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function refreshEmployeeLeaveBalancesManually() {
  if (!state.currentUser) return;

  try {
    setRefreshButtonLoading(state.dom.refreshLeaveBalancesBtn, true);
    await waitForNextPaint();
    await loadEmployeeLeaveBalances();
    await loadEmployeeLeaveRequests();
    clearPageAlert();
    showPageAlert("success", "Leave balances refreshed successfully.");
  } catch (error) {
    console.error("Manual leave balances refresh failed:", error);
    showPageAlert(
      "danger",
      error.message || "Unable to refresh leave balances right now.",
    );
  } finally {
    setRefreshButtonLoading(state.dom.refreshLeaveBalancesBtn, false);
  }
}

async function refreshEmployeeLeaveHistoryManually() {
  if (!state.currentUser) return;

  try {
    setRefreshButtonLoading(state.dom.refreshLeaveRequestsBtn, true);
    await waitForNextPaint();
    await loadEmployeeLeaveRequests();
    await loadEmployeeLeaveBalances();
    clearPageAlert();
    showPageAlert("success", "Leave history refreshed successfully.");
  } catch (error) {
    console.error("Manual leave history refresh failed:", error);
    showPageAlert(
      "danger",
      error.message || "Unable to refresh leave history right now.",
    );
  } finally {
    setRefreshButtonLoading(state.dom.refreshLeaveRequestsBtn, false);
  }
}

async function refreshEmployeePayrollManually() {
  if (!state.currentUser) return;

  try {
    setRefreshButtonLoading(state.dom.refreshPayrollBtn, true);
    await waitForNextPaint();
    await loadEmployeePayroll();
    clearPageAlert();
    showPageAlert("success", "Payroll information refreshed successfully.");
  } catch (error) {
    console.error("Manual payroll refresh failed:", error);
    showPageAlert(
      "danger",
      error.message || "Unable to refresh payroll information right now.",
    );
  } finally {
    setRefreshButtonLoading(state.dom.refreshPayrollBtn, false);
  }
}

function setRefreshButtonLoading(button, isLoading) {
  if (!button) return;

  button.disabled = isLoading;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Refreshing...
    `;
  } else if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function showSection(sectionName) {
  const isProfile = sectionName === "profile";
  const isLeave = sectionName === "leave";
  const isPayroll = sectionName === "payroll";

  state.dom.profileSection?.classList.toggle("d-none", !isProfile);
  state.dom.leaveSection?.classList.toggle("d-none", !isLeave);
  state.dom.payrollSection?.classList.toggle("d-none", !isPayroll);

  [
    state.dom.navProfileBtn,
    state.dom.navLeaveBtn,
    state.dom.navPayrollBtn,
  ].forEach((btn) => {
    if (!btn) return;
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-outline-primary");
  });

  if (isProfile && state.dom.navProfileBtn) {
    state.dom.navProfileBtn.classList.remove("btn-outline-primary");
    state.dom.navProfileBtn.classList.add("btn-primary");
    if (state.dom.heroModuleValue) state.dom.heroModuleValue.textContent = "Profile";
  }

  if (isLeave && state.dom.navLeaveBtn) {
    state.dom.navLeaveBtn.classList.remove("btn-outline-primary");
    state.dom.navLeaveBtn.classList.add("btn-primary");
    if (state.dom.heroModuleValue) state.dom.heroModuleValue.textContent = "Leave Management";
  }

  if (isPayroll && state.dom.navPayrollBtn) {
    state.dom.navPayrollBtn.classList.remove("btn-outline-primary");
    state.dom.navPayrollBtn.classList.add("btn-primary");
    if (state.dom.heroModuleValue) state.dom.heroModuleValue.textContent = "Payroll";
  }
}

/* =========================================================
   Employee record loading
========================================================= */
async function loadEmployeeRecord(userId, userEmail) {
  const supabase = getSupabaseClient();

  let employee = null;
  let lookupMethod = "";

  try {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      employee = data;
      lookupMethod = "user_id";
    }
  } catch (err) {
    console.warn("Lookup by user_id failed:", err);
  }

  if (!employee && userEmail) {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("work_email", userEmail)
        .maybeSingle();

      if (!error && data) {
        employee = data;
        lookupMethod = "work_email";
      }
    } catch (err) {
      console.warn("Lookup by work_email failed:", err);
    }
  }

  if (!employee) {
    const fallbackEmployee = {
      id: userId,
      user_id: userId,
      first_name: "",
      last_name: "",
      work_email: userEmail || state.currentProfile?.email || "",
      phone_number: "",
      role: "Employee",
      department: "--",
      employee_id: "--",
      manager_name: "--",
      job_title: "Employee",
      profile_image_url: "",
    };

    state.employeeRecord = fallbackEmployee;
    applyResolvedIdentity(fallbackEmployee);
    renderEmployeeRecord(fallbackEmployee);

    showPageAlert(
      "warning",
      "Employee record was not found in employees table for this signed-in user.",
    );
    return;
  }

  if (lookupMethod === "work_email") {
    const linkResult = await tryBackfillEmployeeUserId(employee, userId, userEmail);

    if (
      linkResult.status === "linked" ||
      linkResult.status === "linked-no-row-returned"
    ) {
      employee = linkResult.employee;
    }
  }

  state.employeeRecord = employee;
  applyResolvedIdentity(employee);
  renderEmployeeRecord(employee);
}

function getEmployeeManagerDisplayName(employee) {
  return (
    employee.manager_name ||
    employee.line_manager_name ||
    employee.line_manager ||
    employee.supervisor_name ||
    employee.reporting_manager ||
    employee.manager_email ||
    employee.line_manager_email ||
    employee.supervisor_email ||
    "--"
  );
}

function getEmployeeIdDisplayValue(employee) {
  return (
    employee.employee_id ||
    employee.staff_id ||
    employee.employee_number ||
    employee.payroll_number ||
    "--"
  );
}

function getEmployeePhoneDisplayValue(employee) {
  return (
    employee.phone_number ||
    employee.phone ||
    employee.mobile ||
    employee.mobile_phone ||
    employee.work_phone ||
    ""
  );
}

function renderEmployeeRecord(employee) {
  const firstName = employee.first_name || "";
  const lastName = employee.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim() || "Employee";

  const email =
    employee.work_email ||
    employee.email ||
    state.currentProfile?.email ||
    state.currentUser?.email ||
    "";

  const phone = getEmployeePhoneDisplayValue(employee);
  const role = employee.role || state.currentProfile?.role || "Employee";
  const department = employee.department || "--";
  const employeeId = getEmployeeIdDisplayValue(employee);
  const managerName = getEmployeeManagerDisplayName(employee);
  const jobTitle = employee.job_title || employee.position || role || "Employee";

  if (state.dom.employeeDisplayEmail) {
    state.dom.employeeDisplayEmail.textContent = email || "No email";
  }

  if (state.dom.heroRoleValue) {
    state.dom.heroRoleValue.textContent = String(role || "employee").toLowerCase();
  }

  if (state.dom.employeeInitials) {
    const initials =
      `${(firstName || "").charAt(0)}${(lastName || "").charAt(0)}`.trim() ||
      "EM";
    state.dom.employeeInitials.textContent = initials.toUpperCase();
  }

  if (state.dom.profileFullName) {
    state.dom.profileFullName.textContent = fullName;
  }

  if (state.dom.profileJobTitle) {
    state.dom.profileJobTitle.textContent = jobTitle;
  }

  if (state.dom.profileDepartment) {
    state.dom.profileDepartment.textContent = `Department: ${department}`;
  }

  if (state.dom.profileEmployeeId) {
    state.dom.profileEmployeeId.textContent = `Employee ID: ${employeeId}`;
  }

  if (state.dom.firstName) state.dom.firstName.value = firstName;
  if (state.dom.lastName) state.dom.lastName.value = lastName;
  if (state.dom.emailAddress) state.dom.emailAddress.value = email;
  if (state.dom.phoneNumber) state.dom.phoneNumber.value = phone;
  if (state.dom.roleName) state.dom.roleName.value = role;
  if (state.dom.managerName) state.dom.managerName.value = managerName;
}

/* =========================================================
   Profile image
========================================================= */
async function loadLatestEmployeeProfile() {
  if (!state.currentUser?.id) return state.currentProfile;

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", state.currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      state.currentProfile = data;
    }

    return state.currentProfile;
  } catch (error) {
    console.error("Error loading latest employee profile:", error);
    return state.currentProfile;
  }
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

async function renderEmployeeProfileImage() {
  const profileImageElement = state.dom.profileImage;
  const heroImageElement = state.dom.employeeHeroImage;
  const initialsElement = state.dom.employeeInitials;

  if (!profileImageElement) return;

  const initialsText = initialsElement?.textContent || "EMP";
  const fallbackImageUrl = `https://placehold.co/120x120?text=${encodeURIComponent(
    initialsText,
  )}`;

  const imagePath = state.currentProfile?.profile_image_path || "";

  if (!imagePath) {
    profileImageElement.src = fallbackImageUrl;

    if (heroImageElement) {
      heroImageElement.src = "";
      heroImageElement.classList.add("d-none");
    }

    if (initialsElement) {
      initialsElement.classList.remove("d-none");
    }

    return;
  }

  const signedUrl = await getSignedProfileImageUrl(imagePath);

  if (!signedUrl) {
    profileImageElement.src = fallbackImageUrl;

    if (heroImageElement) {
      heroImageElement.src = "";
      heroImageElement.classList.add("d-none");
    }

    if (initialsElement) {
      initialsElement.classList.remove("d-none");
    }

    return;
  }

  profileImageElement.src = signedUrl;

  if (heroImageElement) {
    heroImageElement.src = signedUrl;
    heroImageElement.classList.remove("d-none");
  }

  if (initialsElement) {
    initialsElement.classList.add("d-none");
  }
}

function handlePendingProfileImage(file) {
  state.pendingProfileImageFile = null;

  if (!file) {
    void renderEmployeeProfileImage();
    return;
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  const maxBytes = 5 * 1024 * 1024;

  if (!allowedTypes.includes(file.type)) {
    showPageAlert("warning", "Only PNG, JPG, JPEG, and WEBP images are allowed.");
    if (state.dom.profileImageInput) {
      state.dom.profileImageInput.value = "";
    }
    return;
  }

  if (file.size > maxBytes) {
    showPageAlert("warning", "Profile image must be 5MB or smaller.");
    if (state.dom.profileImageInput) {
      state.dom.profileImageInput.value = "";
    }
    return;
  }

  state.pendingProfileImageFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    if (state.dom.profileImage) {
      state.dom.profileImage.src = reader.result;
    }
    if (state.dom.employeeHeroImage) {
      state.dom.employeeHeroImage.src = reader.result;
      state.dom.employeeHeroImage.classList.remove("d-none");
    }
    if (state.dom.employeeInitials) {
      state.dom.employeeInitials.classList.add("d-none");
    }
  };
  reader.readAsDataURL(file);
}

function setProfileImageUploadLoading(isLoading) {
  const button = state.dom.saveProfileImageBtn;
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

async function uploadEmployeeProfileImage() {
  if (!state.pendingProfileImageFile) {
    showPageAlert("warning", "Please choose an image before uploading.");
    return;
  }

  if (!state.currentUser?.id) {
    showPageAlert("danger", "No active employee session found.");
    return;
  }

  try {
    setProfileImageUploadLoading(true);

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

    await loadLatestEmployeeProfile();

    state.pendingProfileImageFile = null;

    if (state.dom.profileImageInput) {
      state.dom.profileImageInput.value = "";
    }

    await renderEmployeeProfileImage();
    showPageAlert("success", "Profile picture uploaded successfully.");
  } catch (error) {
    console.error("Error uploading employee profile image:", error);
    showPageAlert(
      "danger",
      error.message || "Profile picture could not be uploaded.",
    );
  } finally {
    setProfileImageUploadLoading(false);
  }
}

/* =========================================================
   Leave balances
========================================================= */
async function loadEmployeeLeaveBalances() {
  const supabase = getSupabaseClient();
  const employeeIdentityCandidates = getEmployeeIdentityCandidates();

if (!employeeIdentityCandidates.length) {
  state.payrollRecords = [];
  renderPayroll([]);
  return;
}

  let query = supabase.from("employee_leave_balances").select(`
      id,
      employee_id,
      entitled_days,
      used_days,
      remaining_days,
      leave_types (
        id,
        code,
        name
      )
    `);

  if (employeeIdentityCandidates.length === 1) {
    query = query.eq("employee_id", employeeIdentityCandidates[0]);
  } else {
    query = query.in("employee_id", employeeIdentityCandidates);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading leave balances:", error);
    showPageAlert("danger", "Unable to load leave balances.");
    return;
  }

  const balances = Array.isArray(data)
    ? data.filter(
      (balance, index, array) =>
        array.findIndex((item) => item.id === balance.id) === index,
    )
    : [];

  renderLeaveBalances(balances);
}

function renderLeaveBalances(balances) {
  const grid = state.dom.leaveBalancesGrid;
  if (!grid) return;

  grid.innerHTML = "";

  if (!balances.length) {
    state.dom.leaveBalancesEmptyState?.classList.remove("d-none");
    state.dom.leaveBalancesGrid?.classList.add("d-none");
    return;
  }

  state.dom.leaveBalancesEmptyState?.classList.add("d-none");
  state.dom.leaveBalancesGrid?.classList.remove("d-none");

  balances.forEach((balance) => {
    const leaveTypeName = balance.leave_types?.name || "Unknown Leave Type";

    const card = document.createElement("div");
    card.className = "col-12 col-md-6 col-xl-4";

    card.innerHTML = `
      <div class="info-tile h-100">
        <div class="info-tile-label">Leave Type</div>
        <div class="info-tile-value mb-3">${escapeHtml(leaveTypeName)}</div>

        <div class="row g-3">
          <div class="col-4">
            <div class="info-tile-label">Entitled</div>
            <div class="fw-bold">${balance.entitled_days}</div>
          </div>
          <div class="col-4">
            <div class="info-tile-label">Used</div>
            <div class="fw-bold">${balance.used_days}</div>
          </div>
          <div class="col-4">
            <div class="info-tile-label">Remaining</div>
            <div class="fw-bold">${balance.remaining_days}</div>
          </div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

/* =========================================================
   Leave request form
========================================================= */
function bindLeaveFormEvents() {
  state.dom.startDate?.addEventListener("change", calculateLeaveDays);
  state.dom.endDate?.addEventListener("change", calculateLeaveDays);

  state.dom.leaveRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLeaveRequestSubmit();
  });
}

async function loadLeaveTypes() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("leave_types")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error loading leave types:", error);
    showPageAlert("danger", "Unable to load leave types.");
    return;
  }

  state.dom.leaveType.innerHTML = `<option value="">Select leave type</option>`;

  (data || []).forEach((leaveType) => {
    const option = document.createElement("option");
    option.value = leaveType.id;
    option.textContent = leaveType.name;
    option.dataset.code = leaveType.code;
    state.dom.leaveType.appendChild(option);
  });
}

function calculateLeaveDays() {
  const startDateValue = state.dom.startDate.value;
  const endDateValue = state.dom.endDate.value;

  if (!startDateValue || !endDateValue) {
    state.dom.totalDays.value = "";
    return;
  }

  const startDate = new Date(startDateValue);
  const endDate = new Date(endDateValue);

  if (endDate < startDate) {
    state.dom.totalDays.value = "";
    return;
  }

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const differenceInMilliseconds = endDate - startDate;
  const totalDays =
    Math.floor(differenceInMilliseconds / millisecondsPerDay) + 1;

  state.dom.totalDays.value = totalDays;
}

function validateLeaveRequestForm() {
  let isValid = true;

  const leaveType = state.dom.leaveType.value.trim();
  const startDate = state.dom.startDate.value;
  const endDate = state.dom.endDate.value;
  const reason = state.dom.leaveReason.value.trim();
  const totalDays = Number(state.dom.totalDays.value);

  [
    state.dom.leaveType,
    state.dom.startDate,
    state.dom.endDate,
    state.dom.leaveReason,
  ].forEach((field) => field?.classList.remove("is-invalid"));

  if (!leaveType) {
    state.dom.leaveType.classList.add("is-invalid");
    isValid = false;
  }

  if (!startDate) {
    state.dom.startDate.classList.add("is-invalid");
    isValid = false;
  }

  if (!endDate) {
    state.dom.endDate.classList.add("is-invalid");
    isValid = false;
  }

  if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
    state.dom.endDate.classList.add("is-invalid");
    showPageAlert("warning", "End date cannot be earlier than start date.");
    isValid = false;
  }

  if (!reason) {
    state.dom.leaveReason.classList.add("is-invalid");
    isValid = false;
  }

  if (!totalDays || totalDays < 1) {
    showPageAlert("warning", "Total leave days must be at least 1.");
    isValid = false;
  }

  return isValid;
}

async function handleLeaveRequestSubmit() {
  clearPageAlert();

  if (!state.currentUser) {
    showPageAlert("danger", "No active user session found.");
    return;
  }

  calculateLeaveDays();

  if (!validateLeaveRequestForm()) {
    return;
  }

  const supabase = getSupabaseClient();

  const payload = {
    employee_id: getPreferredEmployeeReferenceId(),
    leave_type_id: state.dom.leaveType.value,
    start_date: state.dom.startDate.value,
    end_date: state.dom.endDate.value,
    total_days: Number(state.dom.totalDays.value),
    reason: state.dom.leaveReason.value.trim(),
    status: "Pending Approval",
  };

  try {
    setLeaveSubmitLoading(true);

    const { error } = await supabase.from("leave_requests").insert([payload]);

    if (error) {
      throw error;
    }

    showPageAlert(
      "success",
      "Leave request submitted successfully and saved with Pending Approval status.",
    );

    state.dom.leaveRequestForm.reset();
    state.dom.totalDays.value = "";

    await loadEmployeeLeaveRequests();
    await loadEmployeeLeaveBalances();
    showSection("leave");
  } catch (error) {
    console.error("Error submitting leave request:", error);
    showPageAlert(
      "danger",
      error.message || "Unable to submit leave request. Please try again.",
    );
  } finally {
    setLeaveSubmitLoading(false);
  }
}

function setLeaveSubmitLoading(isLoading) {
  state.dom.submitLeaveBtn.disabled = isLoading;

  if (isLoading) {
    state.dom.submitLeaveBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Submitting...
    `;
  } else {
    state.dom.submitLeaveBtn.innerHTML = `
      <i class="bi bi-send-check me-1"></i>
      Submit Leave Request
    `;
  }
}

/* =========================================================
   Leave history + decision updates
========================================================= */
async function loadEmployeeLeaveRequests() {
  const supabase = getSupabaseClient();
  const employeeIdentityCandidates = getEmployeeIdentityCandidates();

  if (!employeeIdentityCandidates.length) {
    renderLeaveRequests([]);
    renderLatestDecisionCard([]);
    return;
  }

  let query = supabase.from("leave_requests").select(`
      id,
      employee_id,
      start_date,
      end_date,
      total_days,
      status,
      submitted_at,
      decision_at,
      decision_by,
      decision_by_name,
      decision_comment,
      leave_types (
        name
      )
    `);

  if (employeeIdentityCandidates.length === 1) {
    query = query.eq("employee_id", employeeIdentityCandidates[0]);
  } else {
    query = query.in("employee_id", employeeIdentityCandidates);
  }

  const { data, error } = await query.order("submitted_at", {
    ascending: false,
  });

  if (error) {
    console.error("Error loading leave requests:", error);
    showPageAlert("danger", "Unable to load leave history.");
    return;
  }

  const requests = Array.isArray(data)
    ? data.filter(
      (request, index, array) =>
        array.findIndex((item) => item.id === request.id) === index,
    )
    : [];

  renderLeaveRequests(requests);
  renderLatestDecisionCard(requests);
}

function renderLeaveRequests(requests) {
  const tbody = state.dom.leaveRequestsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!requests.length) {
    state.dom.leaveRequestsEmptyState?.classList.remove("d-none");
    state.dom.leaveRequestsTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.leaveRequestsEmptyState?.classList.add("d-none");
  state.dom.leaveRequestsTableWrapper?.classList.remove("d-none");

  requests.forEach((request) => {
    const row = document.createElement("tr");

    const leaveTypeName = request.leave_types?.name || "Unknown";
    const statusBadgeClass = getDecisionStatusBadgeClass(request.status);

    row.innerHTML = `
      <td>${escapeHtml(leaveTypeName)}</td>
      <td>${formatDate(request.start_date)}</td>
      <td>${formatDate(request.end_date)}</td>
      <td>${request.total_days}</td>
      <td><span class="badge ${statusBadgeClass}">${escapeHtml(request.status)}</span></td>
      <td>${escapeHtml(request.decision_comment || "--")}</td>
      <td>${formatDateTime(request.decision_at)}</td>
      <td>${formatDateTime(request.submitted_at)}</td>
    `;

    tbody.appendChild(row);
  });
}

function renderLatestDecisionCard(requests) {
  const decisionItems = requests
    .filter(
      (item) =>
        !!item.decision_at ||
        normalizeText(item.status) === "approved" ||
        normalizeText(item.status) === "rejected" ||
        normalizeText(item.status) === "returned for clarification",
    )
    .sort((a, b) => {
      const aValue = a.decision_at || a.submitted_at || "";
      const bValue = b.decision_at || b.submitted_at || "";
      return new Date(bValue) - new Date(aValue);
    });

  if (!decisionItems.length) {
    state.dom.latestDecisionEmptyState?.classList.remove("d-none");
    state.dom.latestDecisionCard?.classList.add("d-none");
    return;
  }

  const latest = decisionItems[0];
  const leaveTypeName = latest.leave_types?.name || "Unknown";

  state.dom.latestDecisionEmptyState?.classList.add("d-none");
  state.dom.latestDecisionCard?.classList.remove("d-none");

  state.dom.latestDecisionStatus.innerHTML = `
    <span class="badge ${getDecisionStatusBadgeClass(latest.status)} fs-6">
      ${escapeHtml(latest.status)}
    </span>
  `;

  state.dom.latestDecisionLeaveType.textContent = leaveTypeName;
  state.dom.latestDecisionDateTime.textContent = formatDateTime(
    latest.decision_at || latest.submitted_at,
  );
  state.dom.latestDecisionPeriod.textContent = `${formatDate(
    latest.start_date,
  )} to ${formatDate(latest.end_date)} • ${latest.total_days} day(s)`;

  state.dom.latestDecisionBy.textContent =
    latest.decision_by_name || "Manager / Supervisor";

  state.dom.latestDecisionComment.textContent =
    latest.decision_comment || "No comment provided.";
}

/* =========================================================
   Payroll helpers
========================================================= */
function getPayrollTaxValue(record) {
  const paye = Number(record?.paye_tax || 0);
  const wht = Number(record?.wht_tax || 0);
  return paye > 0 ? paye : wht;
}

function getPayrollTaxLabel(record) {
  const paye = Number(record?.paye_tax || 0);
  const wht = Number(record?.wht_tax || 0);

  if (paye > 0) return "PAYE";
  if (wht > 0) return "WHT";
  return "No Tax";
}

function getPayrollDisplayGroup(record) {
  return (
    record?.employee_group ||
    state.employeeRecord?.employee_group ||
    state.employeeRecord?.group ||
    state.employeeRecord?.staff_group ||
    state.employeeRecord?.role ||
    "Unassigned"
  );
}

function normalizePayrollModel(value) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) return PAYROLL_MODEL_GENERIC;
  if (
    normalized === PAYROLL_MODEL_REGULAR ||
    normalized === "REGULAR_INCREMENT_V1" ||
    normalized === "REGULAR_V1"
  ) {
    return PAYROLL_MODEL_REGULAR;
  }

  return PAYROLL_MODEL_GENERIC;
}

function getPayrollModel(record) {
  const explicitModel = normalizePayrollModel(record?.payroll_model || "");

  if (String(record?.payroll_model || "").trim()) {
    return explicitModel;
  }

  const group = String(getPayrollDisplayGroup(record) || "").trim().toUpperCase();
  return group === "REGULAR" ? PAYROLL_MODEL_REGULAR : PAYROLL_MODEL_GENERIC;
}

function isRegularPayrollRecord(record) {
  return getPayrollModel(record) === PAYROLL_MODEL_REGULAR;
}

function formatPayrollPercent(value, fallbackPercent = null) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    String(value).trim() !== "";

  const numericValue = hasValue ? Number(value) : Number(fallbackPercent);

  if (!Number.isFinite(numericValue)) return "--";

  const resolvedPercent = numericValue > 1 ? numericValue : numericValue * 100;
  return `${resolvedPercent.toFixed(1)}%`;
}

function getRegularStructureVariantLabel(record) {
  const variant = String(
    record?.structure_variant || record?.payroll_model_version || "REGULAR_INCREMENT_V1",
  )
    .trim()
    .toUpperCase();

  if (variant === "REGULAR_INCREMENT_V1" || variant === "V1") {
    return "Regular Increment v1";
  }

  return variant
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildMoneyDisplayItem(label, value, currency, options = {}) {
  return {
    label,
    displayValue: formatCurrency(value, currency),
    emphasis: Boolean(options.emphasis),
  };
}

function buildTextDisplayItem(label, value, options = {}) {
  return {
    label,
    displayValue: value || "--",
    emphasis: Boolean(options.emphasis),
  };
}

function buildGenericPayrollBreakdownItems(record) {
  const currency = record.currency || "NGN";
  const taxValue = getPayrollTaxValue(record);
  const taxLabel = getPayrollTaxLabel(record);

  const rawItems = [
    { label: "Employee Group", value: getPayrollDisplayGroup(record), type: "text" },
    { label: "Base Salary", value: Number(record.base_salary || 0), type: "money" },
    { label: "Basic Pay", value: Number(record.basic_pay || 0), type: "money" },
    { label: "Housing Allowance", value: Number(record.housing_allowance || 0), type: "money" },
    { label: "Transport Allowance", value: Number(record.transport_allowance || 0), type: "money" },
    { label: "Utility Allowance", value: Number(record.utility_allowance || 0), type: "money" },
    { label: "Medical Allowance", value: Number(record.medical_allowance || 0), type: "money" },
    { label: "Other Allowance", value: Number(record.other_allowance || 0), type: "money" },
    { label: "Bonus", value: Number(record.bonus || 0), type: "money" },
    { label: "Overtime", value: Number(record.overtime || 0), type: "money" },
    { label: "Logistics Allowance", value: Number(record.logistics_allowance || 0), type: "money" },
    { label: "Data & Airtime", value: Number(record.data_airtime_allowance || 0), type: "money" },
    { label: "Gross Pay", value: Number(record.gross_pay || 0), type: "money", emphasis: true },
    { label: taxLabel, value: Number(taxValue || 0), type: "money" },
    { label: "Employee Pension", value: Number(record.employee_pension || 0), type: "money" },
    { label: "Employer Pension", value: Number(record.employer_pension || 0), type: "money" },
    { label: "Other Deductions", value: Number(record.other_deductions || 0), type: "money" },
    { label: "Total Deductions", value: Number(record.total_deductions || 0), type: "money", emphasis: true },
    { label: "Net Pay", value: Number(record.net_pay || 0), type: "money", emphasis: true },
  ];

  return rawItems
    .filter((item) => {
      if (item.type === "text") return true;
      if (["Gross Pay", "Total Deductions", "Net Pay"].includes(item.label)) {
        return true;
      }
      if (item.label === "No Tax") return false;
      return Number(item.value) !== 0;
    })
    .map((item) => {
      if (item.type === "money") {
        return {
          ...item,
          displayValue: formatCurrency(item.value, currency),
        };
      }

      return {
        ...item,
        displayValue: item.value || "--",
      };
    });
}

function buildRegularPayrollSections(record) {
  const currency = record.currency || "NGN";
  const payeTax = Number(record.paye_tax || 0);
  const whtTax = Number(record.wht_tax || 0);
  const employeePension = Number(record.employee_pension || 0);
  const employerPension = Number(record.employer_pension || 0);
  const otherDeductions = Number(record.other_deductions || 0);
  const logisticsAllowance = Number(record.logistics_allowance || 0);
  const monthlySalaryPlusLogistics = Number(record.monthly_salary_plus_logistics || 0);

  const netSalary =
    monthlySalaryPlusLogistics !== 0 || logisticsAllowance !== 0
      ? monthlySalaryPlusLogistics - logisticsAllowance
      : Number(record.new_base_salary || 0) -
      payeTax -
      whtTax -
      employeePension -
      otherDeductions;

  const salaryStructureItems = [
    buildTextDisplayItem("Employee Group", getPayrollDisplayGroup(record)),
    buildTextDisplayItem("Payroll Model", "Alpatech Regular"),
    buildMoneyDisplayItem(
      "Base Salary",
      Number(record.base_salary || 0),
      currency,
      { emphasis: true },
    ),
    buildTextDisplayItem(
      "Increment %",
      formatPayrollPercent(record.increment_percent, 5),
    ),
    buildMoneyDisplayItem(
      "Increment Amount",
      Number(record.increment_amount || 0),
      currency,
    ),
    ...(Number(record.merit_increment || 0) !== 0
      ? [
        buildMoneyDisplayItem(
          "Merit Increment",
          Number(record.merit_increment || 0),
          currency,
        ),
      ]
      : []),
    buildMoneyDisplayItem(
      "New Base Salary",
      Number(record.new_base_salary || 0),
      currency,
      { emphasis: true },
    ),
    buildTextDisplayItem(
      "Basic %",
      formatPayrollPercent(record.basic_percent, 50),
    ),
    buildTextDisplayItem(
      "Housing %",
      formatPayrollPercent(record.housing_percent, 10),
    ),
    buildTextDisplayItem(
      "Transport %",
      formatPayrollPercent(record.transport_percent, 10),
    ),
    buildTextDisplayItem(
      "Utility %",
      formatPayrollPercent(record.utility_percent, 10),
    ),
    buildTextDisplayItem(
      "Other Allowance %",
      formatPayrollPercent(record.other_allowance_percent, 20),
    ),
    buildMoneyDisplayItem(
      "BHT",
      Number(record.bht || 0),
      currency,
    ),
  ];

  const earningsItems = [];

  if (Number(record.basic_pay || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem("Basic Pay", Number(record.basic_pay || 0), currency),
    );
  }

  if (Number(record.housing_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Housing Allowance",
        Number(record.housing_allowance || 0),
        currency,
      ),
    );
  }

  if (Number(record.transport_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Transport Allowance",
        Number(record.transport_allowance || 0),
        currency,
      ),
    );
  }

  if (Number(record.utility_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Utility Allowance",
        Number(record.utility_allowance || 0),
        currency,
      ),
    );
  }

  if (Number(record.medical_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Medical Allowance",
        Number(record.medical_allowance || 0),
        currency,
      ),
    );
  }

  if (Number(record.other_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Other Allowance",
        Number(record.other_allowance || 0),
        currency,
      ),
    );
  }

  if (Number(record.bonus || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem("Bonus", Number(record.bonus || 0), currency),
    );
  }

  if (Number(record.overtime || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem("Overtime", Number(record.overtime || 0), currency),
    );
  }

  if (logisticsAllowance !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Logistics Allowance",
        logisticsAllowance,
        currency,
      ),
    );
  }

  if (Number(record.data_airtime_allowance || 0) !== 0) {
    earningsItems.push(
      buildMoneyDisplayItem(
        "Data & Airtime",
        Number(record.data_airtime_allowance || 0),
        currency,
      ),
    );
  }

  earningsItems.push(
    buildMoneyDisplayItem(
      "Gross Pay",
      Number(record.gross_pay || 0),
      currency,
      { emphasis: true },
    ),
  );

  const deductionItems = [];

  if (payeTax !== 0) {
    deductionItems.push(
      buildMoneyDisplayItem("PAYE", payeTax, currency),
    );
  }

  if (whtTax !== 0) {
    deductionItems.push(
      buildMoneyDisplayItem("WHT", whtTax, currency),
    );
  }

  if (employeePension !== 0) {
    deductionItems.push(
      buildMoneyDisplayItem("Employee Pension", employeePension, currency),
    );
  }

  if (otherDeductions !== 0) {
    deductionItems.push(
      buildMoneyDisplayItem("Other Deductions", otherDeductions, currency),
    );
  }

  deductionItems.push(
    buildMoneyDisplayItem(
      "Total Deductions",
      Number(record.total_deductions || 0),
      currency,
      { emphasis: true },
    ),
  );

  const employerContributionItems = [];
  if (employerPension !== 0) {
    employerContributionItems.push(
      buildMoneyDisplayItem("Employer Pension", employerPension, currency),
    );
  }

  const netSummaryItems = [
    buildMoneyDisplayItem(
      "Net Salary",
      netSalary,
      currency,
    ),
  ];

  if (monthlySalaryPlusLogistics !== 0) {
    netSummaryItems.push(
      buildMoneyDisplayItem(
        "Monthly Salary + Logistics",
        monthlySalaryPlusLogistics,
        currency,
      ),
    );
  }

  netSummaryItems.push(
    buildMoneyDisplayItem(
      "Net Pay",
      Number(record.net_pay || 0),
      currency,
      { emphasis: true },
    ),
  );

  return [
    { title: "Salary Structure", items: salaryStructureItems },
    { title: "Earnings", items: earningsItems },
    { title: "Deductions", items: deductionItems },
    ...(employerContributionItems.length
      ? [{ title: "Employer Contribution", items: employerContributionItems }]
      : []),
    { title: "Net Pay Summary", items: netSummaryItems },
  ];
}

function buildPayrollBreakdownSections(record) {
  if (isRegularPayrollRecord(record)) {
    return buildRegularPayrollSections(record);
  }

  return [
    {
      title: "Payroll Breakdown",
      items: buildGenericPayrollBreakdownItems(record),
    },
  ];
}
function buildPayrollBreakdownRowHtml(record) {
  const sections = buildPayrollBreakdownSections(record);

  const sectionHtml = sections
    .map((section) => {
      const itemHtml = section.items
        .map((item) => {
          return `
            <div class="col-12 col-md-6 col-xl-4">
              <div class="info-tile h-100">
                <div class="info-tile-label">${escapeHtml(item.label)}</div>
                <div class="fw-semibold ${item.emphasis ? "fs-5" : ""}">
                  ${escapeHtml(item.displayValue)}
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="col-12">
          <div class="fw-bold mb-2">${escapeHtml(section.title)}</div>
          <div class="row g-3">
            ${itemHtml}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="p-3 p-lg-4 bg-light border rounded-4">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
        <div>
          <div class="fw-bold">${escapeHtml(
    isRegularPayrollRecord(record) ? "Regular Payroll Breakdown" : "Payroll Breakdown",
  )}</div>
          <div class="small text-secondary">
            ${escapeHtml(record.pay_cycle || "--")} • ${formatDate(record.pay_date)}
          </div>
        </div>
      </div>

      <div class="row g-4">
        ${sectionHtml}
      </div>
    </div>
  `;
}

/* =========================================================
   Payroll
========================================================= */

async function loadEmployeePayroll() {
  const supabase = getSupabaseClient();
  const employeeIdentityCandidates = getEmployeeIdentityCandidates();

  if (!employeeIdentityCandidates.length) {
    renderPayroll([]);
    return;
  }

  let query = supabase.from("payroll_records").select(`
      id,
      employee_id,
      pay_cycle,
      pay_date,
      employee_group,

      payroll_model,
      payroll_model_version,
      structure_variant,
      payslip_layout,

      base_salary,
      increment_percent,
      increment_amount,
      merit_increment,
      new_base_salary,
      basic_percent,
      housing_percent,
      transport_percent,
      utility_percent,
      other_allowance_percent,
      bht,
      monthly_salary_plus_logistics,

      basic_pay,
      housing_allowance,
      transport_allowance,
      utility_allowance,
      medical_allowance,
      other_allowance,
      bonus,
      overtime,
      logistics_allowance,
      data_airtime_allowance,

      gross_pay,
      paye_tax,
      wht_tax,
      employee_pension,
      employer_pension,
      other_deductions,
      total_deductions,
      net_pay,

      currency,
      status,
      is_finalised,
      created_at,
      updated_at
    `);

  if (employeeIdentityCandidates.length === 1) {
    query = query.eq("employee_id", employeeIdentityCandidates[0]);
  } else {
    query = query.in("employee_id", employeeIdentityCandidates);
  }

  const { data, error } = await query
    .eq("status", "Authorised")
    .eq("is_finalised", true)
    .order("pay_date", { ascending: false });

  if (error) {
    console.error("Error loading payroll records:", error);
    showPageAlert("danger", "Unable to load payroll history.");
    return;
  }

  const records = Array.isArray(data)
    ? data.filter(
      (record, index, array) =>
        array.findIndex((item) => item.id === record.id) === index,
    )
    : [];

state.payrollRecords = records;
applyPayrollFilters();
}
function renderPayroll(records) {
  const historyRecords = Array.isArray(records) ? records : [];
  renderCurrentPayrollSummary(state.payrollRecords);
  renderPayrollHistory(historyRecords);
}

function getFilteredPayrollRecords() {
  const records = Array.isArray(state.payrollRecords) ? state.payrollRecords : [];

  const searchValue = normalizeText(state.dom.payrollSearchInput?.value || "");
  const fromDateValue = state.dom.payrollDateFromInput?.value || "";
  const toDateValue = state.dom.payrollDateToInput?.value || "";

  return records.filter((record) => {
    const payCycle = normalizeText(record?.pay_cycle || "");
    const matchesSearch = !searchValue || payCycle.includes(searchValue);

    if (!matchesSearch) {
      return false;
    }

    const recordDateValue = String(record?.pay_date || "").trim();
    if (!recordDateValue) {
      return !fromDateValue && !toDateValue;
    }

    const recordDate = new Date(recordDateValue);
    if (Number.isNaN(recordDate.getTime())) {
      return false;
    }

    if (fromDateValue) {
      const fromDate = new Date(fromDateValue);
      if (!Number.isNaN(fromDate.getTime()) && recordDate < fromDate) {
        return false;
      }
    }

    if (toDateValue) {
      const toDate = new Date(toDateValue);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        if (recordDate > toDate) {
          return false;
        }
      }
    }

    return true;
  });
}

function applyPayrollFilters() {
  renderPayroll(getFilteredPayrollRecords());
}

function clearPayrollFilters() {
  if (state.dom.payrollSearchInput) state.dom.payrollSearchInput.value = "";
  if (state.dom.payrollDateFromInput) state.dom.payrollDateFromInput.value = "";
  if (state.dom.payrollDateToInput) state.dom.payrollDateToInput.value = "";

  applyPayrollFilters();
}

function renderCurrentPayrollSummary(records) {
  if (!records.length) {
    state.dom.currentPayrollEmptyState?.classList.remove("d-none");
    state.dom.currentPayrollSummaryGrid?.classList.add("d-none");
    return;
  }

  const latest = records[0];

  state.dom.currentPayrollEmptyState?.classList.add("d-none");
  state.dom.currentPayrollSummaryGrid?.classList.remove("d-none");

  if (state.dom.currentPayCycle) {
    state.dom.currentPayCycle.textContent = latest.pay_cycle || "--";
  }

  if (state.dom.currentGrossPay) {
    state.dom.currentGrossPay.textContent = formatCurrency(
      latest.gross_pay,
      latest.currency || "NGN",
    );
  }

  if (state.dom.currentTotalDeductions) {
    state.dom.currentTotalDeductions.textContent = formatCurrency(
      latest.total_deductions,
      latest.currency || "NGN",
    );
  }

  if (state.dom.currentNetPay) {
    state.dom.currentNetPay.textContent = formatCurrency(
      latest.net_pay,
      latest.currency || "NGN",
    );
  }
}

function renderPayrollHistory(records) {
  const tbody = state.dom.payrollHistoryTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    state.dom.payrollHistoryEmptyState?.classList.remove("d-none");
    state.dom.payrollHistoryTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.payrollHistoryEmptyState?.classList.add("d-none");
  state.dom.payrollHistoryTableWrapper?.classList.remove("d-none");

  records.forEach((record) => {
    const currency = record.currency || "NGN";
    const taxValue = getPayrollTaxValue(record);
    const taxLabel = getPayrollTaxLabel(record);
    const employeePension = Number(record.employee_pension || 0);
    const employeeGroup = getPayrollDisplayGroup(record);

    const row = document.createElement("tr");
    row.className = "payroll-summary-row";
    row.dataset.payrollId = record.id;

    const taxCellHtml =
      taxValue > 0
        ? `
          <div class="fw-semibold">${formatCurrency(taxValue, currency)}</div>
          <div class="small text-secondary">${escapeHtml(taxLabel)}</div>
        `
        : `
          <div class="small text-secondary">No Tax</div>
        `;

    row.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(record.pay_cycle || "--")}</div>
      </td>
      <td>${formatDate(record.pay_date)}</td>
      <td>${escapeHtml(employeeGroup)}</td>
      <td>${formatCurrency(record.gross_pay, currency)}</td>
      <td>${taxCellHtml}</td>
      <td>${formatCurrency(employeePension, currency)}</td>
      <td>${formatCurrency(record.total_deductions, currency)}</td>
      <td>
        <div class="fw-semibold">${formatCurrency(record.net_pay, currency)}</div>
      </td>
      <td>
        <span class="badge text-bg-success">
          ${escapeHtml(record.status || "Authorised")}
        </span>
      </td>
      <td>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary payroll-breakdown-btn"
          data-payroll-id="${escapeHtml(record.id)}"
          data-expanded="false"
        >
          <i class="bi bi-eye me-1"></i>View Breakdown
        </button>
      </td>
      <td>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary download-payslip-btn"
          data-payroll-id="${escapeHtml(record.id)}"
        >
          <i class="bi bi-file-earmark-pdf me-1"></i>Download PDF
        </button>
      </td>
    `;

    const detailRow = document.createElement("tr");
    detailRow.className = "payroll-breakdown-row d-none";
    detailRow.dataset.payrollBreakdownFor = record.id;
    detailRow.innerHTML = `
      <td colspan="11">
        ${buildPayrollBreakdownRowHtml(record)}
      </td>
    `;

    tbody.appendChild(row);
    tbody.appendChild(detailRow);

    const downloadButton = row.querySelector(".download-payslip-btn");
    downloadButton?.addEventListener("click", async () => {
      const payrollId = downloadButton.getAttribute("data-payroll-id");
      await downloadPayslipPdf(payrollId, downloadButton);
    });

    const breakdownButton = row.querySelector(".payroll-breakdown-btn");
    breakdownButton?.addEventListener("click", () => {
      const isExpanded = breakdownButton.getAttribute("data-expanded") === "true";

      tbody
        .querySelectorAll(".payroll-breakdown-row")
        .forEach((item) => item.classList.add("d-none"));

      tbody
        .querySelectorAll(".payroll-breakdown-btn")
        .forEach((btn) => {
          btn.setAttribute("data-expanded", "false");
          btn.innerHTML = `<i class="bi bi-eye me-1"></i>View Breakdown`;
        });

      if (!isExpanded) {
        detailRow.classList.remove("d-none");
        breakdownButton.setAttribute("data-expanded", "true");
        breakdownButton.innerHTML = `<i class="bi bi-eye-slash me-1"></i>Hide Breakdown`;
      }
    });
  });
}

/* =========================================================
   Download payslip PDF with jsPDF
========================================================= */
function buildGenericPayslipBreakdownRows(payrollRecord) {
  const currency = payrollRecord.currency || "NGN";
  const taxValue = getPayrollTaxValue(payrollRecord);
  const taxLabel = getPayrollTaxLabel(payrollRecord);

  const rawRows = [
    ["Base Salary", Number(payrollRecord.base_salary || 0)],
    ["Basic Pay", Number(payrollRecord.basic_pay || 0)],
    ["Housing Allowance", Number(payrollRecord.housing_allowance || 0)],
    ["Transport Allowance", Number(payrollRecord.transport_allowance || 0)],
    ["Utility Allowance", Number(payrollRecord.utility_allowance || 0)],
    ["Medical Allowance", Number(payrollRecord.medical_allowance || 0)],
    ["Other Allowance", Number(payrollRecord.other_allowance || 0)],
    ["Bonus", Number(payrollRecord.bonus || 0)],
    ["Overtime", Number(payrollRecord.overtime || 0)],
    ["Logistics Allowance", Number(payrollRecord.logistics_allowance || 0)],
    ["Data & Airtime", Number(payrollRecord.data_airtime_allowance || 0)],
    ["Gross Pay", Number(payrollRecord.gross_pay || 0)],
    [taxLabel, Number(taxValue || 0)],
    ["Employee Pension", Number(payrollRecord.employee_pension || 0)],
    ["Employer Pension", Number(payrollRecord.employer_pension || 0)],
    ["Other Deductions", Number(payrollRecord.other_deductions || 0)],
    ["Total Deductions", Number(payrollRecord.total_deductions || 0)],
    ["Net Pay", Number(payrollRecord.net_pay || 0)],
  ];

  return rawRows
    .filter(([label, amount]) => {
      const alwaysShow = ["Gross Pay", "Total Deductions", "Net Pay"];
      if (alwaysShow.includes(label)) return true;
      if (label === "No Tax") return false;
      return Number(amount) !== 0;
    })
    .map(([label, amount]) => ({
      label,
      value: formatCurrency(amount, currency),
      emphasis: ["Gross Pay", "Total Deductions", "Net Pay"].includes(label),
    }));
}

function buildPayslipSections(payrollRecord) {
  if (isRegularPayrollRecord(payrollRecord)) {
    return buildRegularPayrollSections(payrollRecord).map((section) => ({
      title: section.title,
      rows: section.items.map((item) => ({
        label: item.label,
        value: item.displayValue,
        emphasis: Boolean(item.emphasis),
      })),
    }));
  }

  return [
    {
      title: "Payroll Breakdown",
      rows: buildGenericPayslipBreakdownRows(payrollRecord),
    },
  ];
}

function ensurePdfVerticalSpace(doc, currentY, requiredHeight) {
  if (currentY + requiredHeight <= 280) {
    return currentY;
  }

  doc.addPage();
  return 20;
}

function drawPdfSectionTable(doc, title, rows, startY) {
  let y = ensurePdfVerticalSpace(doc, startY, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(17, 24, 39);
  doc.text(title, 14, y);

  y += 6;
  y = ensurePdfVerticalSpace(doc, y, 12);

  doc.setFillColor(243, 244, 246);
  doc.rect(14, y, 182, 9, "F");
  doc.setDrawColor(209, 213, 219);
  doc.rect(14, y, 182, 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", 18, y + 6);
  doc.text("Amount / Value", 170, y + 6, { align: "right" });

  y += 9;

  rows.forEach((row) => {
    y = ensurePdfVerticalSpace(doc, y, 10);

    doc.rect(14, y, 182, 9);

    doc.setFont("helvetica", row.emphasis ? "bold" : "normal");
    doc.setFontSize(10);
    doc.text(String(row.label || "--"), 18, y + 6);
    doc.text(String(row.value || "--"), 170, y + 6, { align: "right" });

    y += 9;
  });

  return y + 6;
}

async function downloadPayslipPdf(payrollId, buttonElement) {
  try {
    clearPageAlert();

    const payrollRecord = state.payrollRecords.find(
      (record) => record.id === payrollId,
    );

    if (!payrollRecord) {
      showPageAlert(
        "danger",
        "Payslip could not be generated because the payroll record was not found.",
      );
      return;
    }

    if ((payrollRecord.status || "").toLowerCase() !== "authorised") {
      showPageAlert(
        "warning",
        "Only authorised payroll records can be downloaded as payslips.",
      );
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showPageAlert("danger", "jsPDF library is not available.");
      return;
    }

    setPayslipDownloadLoading(buttonElement, true);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const employeeName =
      `${state.employeeRecord?.first_name || ""} ${state.employeeRecord?.last_name || ""}`.trim() ||
      "Employee";

    const employeeEmail =
      state.employeeRecord?.work_email ||
      state.currentProfile?.email ||
      state.currentUser?.email ||
      "--";

    const employeeId = getEmployeeIdDisplayValue(state.employeeRecord || {});
    const department = state.employeeRecord?.department || "--";
    const employeeGroup = getPayrollDisplayGroup(payrollRecord);
    const currency = (payrollRecord.currency || "NGN").toUpperCase();
    const payslipSections = buildPayslipSections(payrollRecord);

    doc.setFillColor(185, 106, 16);
    doc.rect(0, 0, 210, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("HR & Payroll System", 14, 14);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Official Employee Payslip", 14, 21);

    doc.setTextColor(17, 24, 39);

    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Employee Details", 14, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`Name: ${employeeName}`, 14, y);
    y += 6;
    doc.text(`Email: ${employeeEmail}`, 14, y);
    y += 6;
    doc.text(`Employee ID: ${employeeId}`, 14, y);
    y += 6;
    doc.text(`Department: ${department}`, 14, y);
    y += 6;
    doc.text(`Employee Group: ${employeeGroup}`, 14, y);

    let rightY = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Pay Details", 120, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`Pay Cycle: ${payrollRecord.pay_cycle || "--"}`, 120, rightY);
    rightY += 6;
    doc.text(`Pay Date: ${formatDate(payrollRecord.pay_date)}`, 120, rightY);
    rightY += 6;
    doc.text(`Status: ${payrollRecord.status || "--"}`, 120, rightY);
    rightY += 6;
    doc.text(`Currency: ${currency}`, 120, rightY);
    if (!isRegularPayrollRecord(payrollRecord)) {
      rightY += 6;
      doc.text("Payroll Model: Generic", 120, rightY);
    }

    y = 86;
    doc.setDrawColor(209, 213, 219);
    doc.line(14, y, 196, y);
    y += 10;

    payslipSections.forEach((section) => {
      y = drawPdfSectionTable(doc, section.title, section.rows, y);
    });

    y = ensurePdfVerticalSpace(doc, y + 6, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(
      "This payslip was generated from an authorised payroll record in the HR & Payroll System.",
      14,
      y,
    );

    const safePayCycle = (payrollRecord.pay_cycle || "Payslip")
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const safeEmployeeName =
      employeeName.replace(/\s+/g, "-").replace(/[^\w-]/g, "") || "Employee";

    const filename = `Payslip_${safePayCycle}_${safeEmployeeName}.pdf`;
    doc.save(filename);

    showPageAlert("success", "Payslip PDF downloaded successfully.");
  } catch (error) {
    console.error("Error generating payslip PDF:", error);
    showPageAlert("danger", error.message || "Unable to generate payslip PDF.");
  } finally {
    setPayslipDownloadLoading(buttonElement, false);
  }
}

function setPayslipDownloadLoading(buttonElement, isLoading) {
  if (!buttonElement) return;

  buttonElement.disabled = isLoading;

  if (isLoading) {
    buttonElement.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
      Generating...
    `;
  } else {
    buttonElement.innerHTML = `
      <i class="bi bi-file-earmark-pdf me-1"></i>Download PDF
    `;
  }
}

/* =========================================================
   Common helpers
========================================================= */
function getDecisionStatusBadgeClass(status) {
  switch ((status || "").toLowerCase()) {
    case "approved":
      return "text-bg-success";
    case "rejected":
      return "text-bg-danger";
    case "returned":
    case "returned for clarification":
      return "text-bg-warning";
    case "pending approval":
    default:
      return "text-bg-secondary";
  }
}

function showPageAlert(type, message) {
  if (!state.dom.pageAlert) return;
  state.dom.pageAlert.className = `alert alert-${type} mb-4`;
  state.dom.pageAlert.textContent = message;
  state.dom.pageAlert.classList.remove("d-none");
}

function clearPageAlert() {
  if (!state.dom.pageAlert) return;
  state.dom.pageAlert.className = "alert d-none mb-4";
  state.dom.pageAlert.textContent = "";
}

function formatDate(dateValue) {
  if (!dateValue) return "--";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateValue) {
  if (!dateValue) return "--";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}