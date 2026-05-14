document.addEventListener("DOMContentLoaded", async () => {
  try {
    cacheDomElements();
    bindEvents();

    const access = await window.SessionManager.protectPage([
      "admin",
      "system_admin",
    ]);

    if (!access) return;

    state.currentUser = access.session.user;
    state.currentProfile = access.profile;

    renderAdminProfile(access.profile, access.session.user);

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
    // Load tenant/company records after Admin access is confirmed.
    await refreshTenantWorkspace();

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
    // Load profiles so Admin can link users to tenant/company records.
    await refreshProfileTenantLinkingWorkspace();

    switchAdminWorkspace("profile");

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
    // Expose tenant edit action for the Tenant Records table.
    window.adminEditTenantRecord = (tenantId) => {
      startTenantEdit(tenantId);
    };

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
    // Expose profile tenant assignment action for the records table.
    window.adminEditProfileTenantLink = (profileId) => {
      startProfileTenantLinkEdit(profileId);
    };
  } catch (error) {
    console.error("Error initialising admin dashboard:", error);
    showPageAlert(
      "danger",
      error.message ||
      "An unexpected error occurred while loading the admin dashboard.",
    );
  }
});

const state = {
  currentUser: null,
  currentProfile: null,

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
  // Holds tenant/company records created by Admin.
  tenants: [],

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
  // Tracks the tenant currently being edited.
  currentEditingTenant: null,

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
  // Holds user profiles for Admin tenant assignment.
  profilesForTenantLinking: [],

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
  // Tracks the profile currently being linked to a tenant/company.
  currentEditingProfileTenantLink: null,

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

    adminTabProfileBtn: document.getElementById("adminTabProfileBtn"),
    adminTabOverviewBtn: document.getElementById("adminTabOverviewBtn"),

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
    // Tenant workspace tab and section.
    adminTabTenantsBtn: document.getElementById("adminTabTenantsBtn"),

    adminProfileSection: document.getElementById("adminProfileSection"),
    adminOverviewSection: document.getElementById("adminOverviewSection"),
    adminTenantsSection: document.getElementById("adminTenantsSection"),

    adminInitials: document.getElementById("adminInitials"),
    adminEmail: document.getElementById("adminEmail"),
    adminRole: document.getElementById("adminRole"),
    adminModuleValue: document.getElementById("adminModuleValue"),

    adminFullName: document.getElementById("adminFullName"),
    adminEmailTile: document.getElementById("adminEmailTile"),
    adminRoleTile: document.getElementById("adminRoleTile"),
    adminDepartment: document.getElementById("adminDepartment"),

    adminProfileAvatar: document.getElementById("adminProfileAvatar"),
    adminProfileCardName: document.getElementById("adminProfileCardName"),
    adminProfileCardEmail: document.getElementById("adminProfileCardEmail"),
    adminProfileForm: document.getElementById("adminProfileForm"),
    adminProfileFullName: document.getElementById("adminProfileFullName"),
    adminProfileEmail: document.getElementById("adminProfileEmail"),
    adminProfileRole: document.getElementById("adminProfileRole"),
    adminProfileDepartment: document.getElementById("adminProfileDepartment"),
    saveAdminProfileBtn: document.getElementById("saveAdminProfileBtn"),

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
    // Tenant / Company setup form and records table.
    tenantCreateForm: document.getElementById("tenantCreateForm"),
    editingTenantId: document.getElementById("editingTenantId"),
    tenantCompanyName: document.getElementById("tenantCompanyName"),
    tenantCode: document.getElementById("tenantCode"),
    tenantStatus: document.getElementById("tenantStatus"),

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1D
    // Notes was removed from the first tenant setup UI to keep the feature lean.
    saveTenantBtn: document.getElementById("saveTenantBtn"),
    saveTenantBtnText: document.getElementById("saveTenantBtnText"),
    cancelTenantEditBtn: document.getElementById("cancelTenantEditBtn"),
    refreshTenantsBtn: document.getElementById("refreshTenantsBtn"),
    tenantRecordsHeader: document.getElementById("tenantRecordsHeader"),
    tenantRecordsEmptyState: document.getElementById("tenantRecordsEmptyState"),
    tenantRecordsTableWrapper: document.getElementById("tenantRecordsTableWrapper"),
    tenantRecordsTableBody: document.getElementById("tenantRecordsTableBody"),

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
    // User/profile to tenant/company assignment controls.
    profileTenantLinkForm: document.getElementById("profileTenantLinkForm"),
    editingProfileTenantLinkProfileId: document.getElementById("editingProfileTenantLinkProfileId"),
    profileTenantProfileId: document.getElementById("profileTenantProfileId"),
    profileTenantTenantId: document.getElementById("profileTenantTenantId"),
    saveProfileTenantLinkBtn: document.getElementById("saveProfileTenantLinkBtn"),
    saveProfileTenantLinkBtnText: document.getElementById("saveProfileTenantLinkBtnText"),
    cancelProfileTenantLinkEditBtn: document.getElementById("cancelProfileTenantLinkEditBtn"),
    refreshProfileTenantLinksBtn: document.getElementById("refreshProfileTenantLinksBtn"),
    profileTenantLinksHeader: document.getElementById("profileTenantLinksHeader"),
    profileTenantLinksEmptyState: document.getElementById("profileTenantLinksEmptyState"),
    profileTenantLinksTableWrapper: document.getElementById("profileTenantLinksTableWrapper"),
    profileTenantLinksTableBody: document.getElementById("profileTenantLinksTableBody"),
  };
}

function bindEvents() {
  state.dom.logoutBtn?.addEventListener("click", async () => {
    await window.SessionManager.logoutUser("logout");
  });

  state.dom.adminTabProfileBtn?.addEventListener("click", () => {
    switchAdminWorkspace("profile");
  });

  state.dom.adminTabOverviewBtn?.addEventListener("click", () => {
    switchAdminWorkspace("overview");
  });

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
  // Open tenant/company setup workspace.
  state.dom.adminTabTenantsBtn?.addEventListener("click", () => {
    switchAdminWorkspace("tenants");
  });

  state.dom.tenantCreateForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveTenantRecord();
  });

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1D
  // Only the required tenant setup fields control save readiness.
  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1D
  // Reset only the fields still used by the lean tenant setup form.
  [
    state.dom.tenantCompanyName,
    state.dom.tenantCode,
  ].forEach((field) => {
    field?.addEventListener("input", updateTenantSaveButtonState);
    field?.addEventListener("change", updateTenantSaveButtonState);
  });

  state.dom.cancelTenantEditBtn?.addEventListener("click", () => {
    resetTenantForm();
    showPageAlert("info", "Tenant edit was cancelled.");
  });

  state.dom.refreshTenantsBtn?.addEventListener("click", async () => {
    await refreshTenantWorkspace();

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
    // Keep the tenant assignment dropdown current after tenant refresh.
    populateProfileTenantTenantOptions();
  });

  state.dom.profileTenantLinkForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveProfileTenantLink();
  });

  [
    state.dom.profileTenantProfileId,
    state.dom.profileTenantTenantId,
  ].forEach((field) => {
    field?.addEventListener("input", updateProfileTenantLinkSaveButtonState);
    field?.addEventListener("change", updateProfileTenantLinkSaveButtonState);
  });

  state.dom.cancelProfileTenantLinkEditBtn?.addEventListener("click", () => {
    resetProfileTenantLinkForm();
    showPageAlert("info", "User tenant assignment edit was cancelled.");
  });

  state.dom.refreshProfileTenantLinksBtn?.addEventListener("click", async () => {
    await refreshProfileTenantLinkingWorkspace();
  });

  state.dom.adminProfileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveAdminOwnProfile();
  });
}

function switchAdminWorkspace(workspace) {
  const isProfile = workspace === "profile";
  const isOverview = workspace === "overview";
  const isTenants = workspace === "tenants";

  state.dom.adminProfileSection?.classList.toggle("d-none", !isProfile);
  state.dom.adminOverviewSection?.classList.toggle("d-none", !isOverview);
  state.dom.adminTenantsSection?.classList.toggle("d-none", !isTenants);

  state.dom.adminTabProfileBtn.className = isProfile
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-outline-primary dashboard-action-btn";

  state.dom.adminTabOverviewBtn.className = isOverview
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-outline-primary dashboard-action-btn";

  // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
  // Keep tenant workspace navigation consistent with existing Admin tabs.
  if (state.dom.adminTabTenantsBtn) {
    state.dom.adminTabTenantsBtn.className = isTenants
      ? "btn btn-primary dashboard-action-btn"
      : "btn btn-outline-primary dashboard-action-btn";
  }

  if (state.dom.adminModuleValue) {
    state.dom.adminModuleValue.textContent = isProfile
      ? "Profile"
      : isOverview
        ? "Administrative Overview"
        : "Tenants";
  }
}

function getInitials(fullName, fallback = "AD") {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return fallback;

  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function showPageAlert(type, message) {
  if (!state.dom.pageAlert) return;

  state.dom.pageAlert.className = `alert alert-${type} mb-4`;
  state.dom.pageAlert.textContent = message;
  state.dom.pageAlert.classList.remove("d-none");
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
// Simple HTML escaping for tenant records rendered into table rows.
function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function getTenantStatusBadgeClass(status = "") {
  return String(status || "").toLowerCase() === "active"
    ? "text-bg-success"
    : "text-bg-secondary";
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
// Tenant ID is a login code, so keep it clean and consistent.
function normaliseTenantCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isTenantCodeValid(value = "") {
  return /^[A-Z0-9_-]{2,40}$/.test(normaliseTenantCode(value));
}

function updateTenantSaveButtonState() {
  const canSubmit = Boolean(
    String(state.dom.tenantCompanyName?.value || "").trim() &&
    isTenantCodeValid(state.dom.tenantCode?.value || "") &&
    String(state.dom.tenantStatus?.value || "").trim(),
  );

  const button = state.dom.saveTenantBtn;
  if (!button) return;

  button.disabled = !canSubmit;
  button.className = canSubmit
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-secondary dashboard-action-btn";
}

function clearTenantValidationState() {
  [
    state.dom.tenantCompanyName,
    state.dom.tenantCode,
    state.dom.tenantStatus,
  ].forEach((field) => {
    field?.classList.remove("is-invalid");
  });
}

function validateTenantForm() {
  clearTenantValidationState();

  const companyName = String(state.dom.tenantCompanyName?.value || "").trim();
  const tenantCode = normaliseTenantCode(state.dom.tenantCode?.value || "");
  const status = String(state.dom.tenantStatus?.value || "").trim();

  if (!companyName) {
    state.dom.tenantCompanyName?.classList.add("is-invalid");
    showPageAlert("warning", "Company name is required before creating a tenant.");
    state.dom.tenantCompanyName?.focus();
    return false;
  }

  if (!tenantCode || !isTenantCodeValid(tenantCode)) {
    state.dom.tenantCode?.classList.add("is-invalid");
    showPageAlert(
      "warning",
      "Tenant ID / Company ID must be 2-40 characters and can only contain letters, numbers, hyphen, or underscore.",
    );
    state.dom.tenantCode?.focus();
    return false;
  }

  if (!status) {
    state.dom.tenantStatus?.classList.add("is-invalid");
    showPageAlert("warning", "Tenant status is required.");
    state.dom.tenantStatus?.focus();
    return false;
  }

  return true;
}

function buildTenantPayload() {
  return {
    company_name: String(state.dom.tenantCompanyName?.value || "").trim(),
    tenant_code: normaliseTenantCode(state.dom.tenantCode?.value || ""),
    status: String(state.dom.tenantStatus?.value || "Active").trim(),

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1D
    // Notes is not collected in the first tenant setup UI.
    // Keep saved payload focused on login segmentation fields only.
    created_by: state.currentUser?.id || null,
    updated_by: state.currentUser?.id || null,
  };
}

function setTenantSaveLoading(isLoading) {
  const button = state.dom.saveTenantBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Saving Tenant...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.saveTenantBtnText = document.getElementById("saveTenantBtnText");
  }

  updateTenantSaveButtonState();
}

function resetTenantForm() {
  state.currentEditingTenant = null;

  if (state.dom.editingTenantId) {
    state.dom.editingTenantId.value = "";
  }

  [
    state.dom.tenantCompanyName,
    state.dom.tenantCode,
    state.dom.tenantNotes,
  ].forEach((field) => {
    if (field) {
      field.value = "";
      field.classList.remove("is-invalid");
    }
  });

  if (state.dom.tenantStatus) {
    state.dom.tenantStatus.value = "Active";
    state.dom.tenantStatus.classList.remove("is-invalid");
  }

  state.dom.cancelTenantEditBtn?.classList.add("d-none");

  if (state.dom.saveTenantBtn) {
    state.dom.saveTenantBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="saveTenantBtnText">Create Tenant</span>
    `;
    state.dom.saveTenantBtnText = document.getElementById("saveTenantBtnText");
  }

  updateTenantSaveButtonState();
}

function renderTenantRecordsLoadingState() {
  if (!state.dom.tenantRecordsTableBody) return;

  state.dom.tenantRecordsEmptyState?.classList.add("d-none");
  state.dom.tenantRecordsTableWrapper?.classList.remove("d-none");

  state.dom.tenantRecordsTableBody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-secondary py-4">
        Loading tenant/company records.
      </td>
    </tr>
  `;
}

function renderTenantRecords(records = []) {
  const tbody = state.dom.tenantRecordsTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    state.dom.tenantRecordsEmptyState?.classList.remove("d-none");
    state.dom.tenantRecordsTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.tenantRecordsEmptyState?.classList.add("d-none");
  state.dom.tenantRecordsTableWrapper?.classList.remove("d-none");

  records.forEach((record) => {
    const row = document.createElement("tr");

    row.innerHTML = `
<td>
  <!-- HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1D
       Tenant Records show only the core company name for the first version. -->
  <div class="fw-semibold">${escapeHtml(record.company_name || "--")}</div>
</td>

      <td>
        <span class="badge rounded-pill text-bg-light border">
          ${escapeHtml(record.tenant_code || "--")}
        </span>
      </td>

      <td>
        <span class="badge ${getTenantStatusBadgeClass(record.status)}">
          ${escapeHtml(record.status || "--")}
        </span>
      </td>

      <td class="text-nowrap">${formatDate(record.updated_at || record.created_at)}</td>

      <td class="text-center">
        <!-- HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1C
             Edit existing tenant/company setup without creating duplicates. -->
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          title="Edit tenant"
          onclick="window.adminEditTenantRecord('${escapeHtml(record.id)}')"
        >
          <i class="bi bi-pencil-square"></i>
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

async function refreshTenantWorkspace() {
  renderTenantRecordsLoadingState();

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .order("company_name", { ascending: true });

    if (error) throw error;

    state.tenants = Array.isArray(data) ? data : [];
    renderTenantRecords(state.tenants);
    updateTenantSaveButtonState();

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
    // Keep tenant assignment dropdown in sync with saved tenant records.
    populateProfileTenantTenantOptions();
  } catch (error) {
    console.error("Error loading tenant records:", error);
    state.tenants = [];
    renderTenantRecords([]);

    showPageAlert(
      "danger",
      error.message || "Tenant/company records could not be loaded.",
    );
  }
}

function getTenantById(tenantId = "") {
  const id = String(tenantId || "").trim();

  if (!id) return null;

  return (state.tenants || []).find(
    (tenant) => String(tenant.id || "").trim() === id,
  ) || null;
}

function startTenantEdit(tenantId) {
  const tenant = getTenantById(tenantId);

  if (!tenant) {
    showPageAlert(
      "warning",
      "The selected tenant/company record could not be found. Please refresh and try again.",
    );
    return;
  }

  state.currentEditingTenant = tenant;

  if (state.dom.editingTenantId) {
    state.dom.editingTenantId.value = tenant.id || "";
  }

  if (state.dom.tenantCompanyName) {
    state.dom.tenantCompanyName.value = tenant.company_name || "";
  }

  if (state.dom.tenantCode) {
    state.dom.tenantCode.value = tenant.tenant_code || "";
  }

  if (state.dom.tenantStatus) {
    state.dom.tenantStatus.value = tenant.status || "Active";
  }


  state.dom.cancelTenantEditBtn?.classList.remove("d-none");

  if (state.dom.saveTenantBtn) {
    state.dom.saveTenantBtn.innerHTML = `
      <i class="bi bi-save me-2"></i>
      <span id="saveTenantBtnText">Update Tenant</span>
    `;
    state.dom.saveTenantBtnText = document.getElementById("saveTenantBtnText");
  }

  updateTenantSaveButtonState();

  state.dom.tenantCompanyName?.focus();
}

async function saveTenantRecord() {
  if (!validateTenantForm()) {
    updateTenantSaveButtonState();
    return;
  }

  const payload = buildTenantPayload();
  const editingId = String(
    state.currentEditingTenant?.id || state.dom.editingTenantId?.value || "",
  ).trim();

  try {
    setTenantSaveLoading(true);

    const supabase = getSupabaseClient();

    let response;

    if (editingId) {
      const updatePayload = {
        ...payload,
        updated_by: state.currentUser?.id || null,
      };

      delete updatePayload.created_by;

      response = await supabase
        .from("tenants")
        .update(updatePayload)
        .eq("id", editingId)
        .select("*")
        .maybeSingle();
    } else {
      response = await supabase
        .from("tenants")
        .insert([payload])
        .select("*")
        .maybeSingle();
    }

    if (response.error) throw response.error;

    await refreshTenantWorkspace();

    showPageAlert(
      "success",
      `Tenant/company record was ${editingId ? "updated" : "created"} successfully.`,
    );

    resetTenantForm();
  } catch (error) {
    console.error("Error saving tenant record:", error);

    const message = String(error.message || "").toLowerCase();

    if (
      message.includes("duplicate key value") ||
      message.includes("tenants_tenant_code_lower_unique") ||
      message.includes("tenant_code")
    ) {
      showPageAlert(
        "warning",
        "This Tenant ID / Company ID already exists. Please use a different ID.",
      );
      return;
    }

    showPageAlert(
      "danger",
      error.message || "Tenant/company record could not be saved.",
    );
  } finally {
    setTenantSaveLoading(false);
  }
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
// Display name used in profile dropdowns and user tenant link records.
function getProfileDisplayName(profile = {}) {
  return (
    String(profile.full_name || "").trim() ||
    String(profile.email || "").trim() ||
    "Unnamed profile"
  );
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
// Find tenant record from already-loaded Admin tenant records.
function getTenantByTenantId(tenantId = "") {
  const id = String(tenantId || "").trim();

  if (!id) return null;

  return (state.tenants || []).find(
    (tenant) => String(tenant.id || "").trim() === id,
  ) || null;
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
// Populate the User/Profile dropdown from loaded profiles.
function populateProfileTenantProfileOptions() {
  const select = state.dom.profileTenantProfileId;
  if (!select) return;

  const currentValue = String(select.value || "").trim();

  select.innerHTML = `<option value="">Select user/profile</option>`;

  const profiles = [...(state.profilesForTenantLinking || [])].sort((a, b) =>
    getProfileDisplayName(a).localeCompare(getProfileDisplayName(b), undefined, {
      sensitivity: "base",
    }),
  );

  profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${getProfileDisplayName(profile)} — ${profile.email || "No email"}`;
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

  updateProfileTenantLinkSaveButtonState();
}

// HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
// Populate the Tenant/Company dropdown from Admin-created tenant records.
function populateProfileTenantTenantOptions() {
  const select = state.dom.profileTenantTenantId;
  if (!select) return;

  const currentValue = String(select.value || "").trim();

  select.innerHTML = `<option value="">Select tenant/company</option>`;

  const activeTenants = [...(state.tenants || [])]
    .filter((tenant) => String(tenant.status || "").toLowerCase() === "active")
    .sort((a, b) =>
      String(a.company_name || "").localeCompare(String(b.company_name || ""), undefined, {
        sensitivity: "base",
      }),
    );

  activeTenants.forEach((tenant) => {
    const option = document.createElement("option");
    option.value = tenant.id;
    option.textContent = `${tenant.company_name || "Unnamed Company"} — ${tenant.tenant_code || "--"}`;
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

  updateProfileTenantLinkSaveButtonState();
}

function updateProfileTenantLinkSaveButtonState() {
  const canSubmit = Boolean(
    String(state.dom.profileTenantProfileId?.value || "").trim() &&
    String(state.dom.profileTenantTenantId?.value || "").trim(),
  );

  const button = state.dom.saveProfileTenantLinkBtn;
  if (!button) return;

  button.disabled = !canSubmit;
  button.className = canSubmit
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-secondary dashboard-action-btn";
}

function clearProfileTenantLinkValidationState() {
  [
    state.dom.profileTenantProfileId,
    state.dom.profileTenantTenantId,
  ].forEach((field) => {
    field?.classList.remove("is-invalid");
  });
}

function validateProfileTenantLinkForm() {
  clearProfileTenantLinkValidationState();

  const profileId = String(state.dom.profileTenantProfileId?.value || "").trim();
  const tenantId = String(state.dom.profileTenantTenantId?.value || "").trim();

  if (!profileId) {
    state.dom.profileTenantProfileId?.classList.add("is-invalid");
    showPageAlert("warning", "Select the user/profile to link.");
    state.dom.profileTenantProfileId?.focus();
    return false;
  }

  if (!tenantId) {
    state.dom.profileTenantTenantId?.classList.add("is-invalid");
    showPageAlert("warning", "Select the tenant/company for this user.");
    state.dom.profileTenantTenantId?.focus();
    return false;
  }

  return true;
}

function setProfileTenantLinkSaveLoading(isLoading) {
  const button = state.dom.saveProfileTenantLinkBtn;
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Saving Tenant Link...
    `;
    return;
  }

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
    state.dom.saveProfileTenantLinkBtnText =
      document.getElementById("saveProfileTenantLinkBtnText");
  }

  updateProfileTenantLinkSaveButtonState();
}

function resetProfileTenantLinkForm() {
  state.currentEditingProfileTenantLink = null;

  if (state.dom.editingProfileTenantLinkProfileId) {
    state.dom.editingProfileTenantLinkProfileId.value = "";
  }

  [
    state.dom.profileTenantProfileId,
    state.dom.profileTenantTenantId,
  ].forEach((field) => {
    if (field) {
      field.value = "";
      field.classList.remove("is-invalid");
    }
  });

  state.dom.cancelProfileTenantLinkEditBtn?.classList.add("d-none");

  if (state.dom.saveProfileTenantLinkBtn) {
    state.dom.saveProfileTenantLinkBtn.innerHTML = `
      <i class="bi bi-link-45deg me-2"></i>
      <span id="saveProfileTenantLinkBtnText">Save Tenant Link</span>
    `;
    state.dom.saveProfileTenantLinkBtnText =
      document.getElementById("saveProfileTenantLinkBtnText");
  }

  updateProfileTenantLinkSaveButtonState();
}

function renderProfileTenantLinksLoadingState() {
  if (!state.dom.profileTenantLinksTableBody) return;

  state.dom.profileTenantLinksEmptyState?.classList.add("d-none");
  state.dom.profileTenantLinksTableWrapper?.classList.remove("d-none");

  state.dom.profileTenantLinksTableBody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-secondary py-4">
        Loading user tenant links.
      </td>
    </tr>
  `;
}

function renderProfileTenantLinks(records = []) {
  const tbody = state.dom.profileTenantLinksTableBody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!records.length) {
    state.dom.profileTenantLinksEmptyState?.classList.remove("d-none");
    state.dom.profileTenantLinksTableWrapper?.classList.add("d-none");
    return;
  }

  state.dom.profileTenantLinksEmptyState?.classList.add("d-none");
  state.dom.profileTenantLinksTableWrapper?.classList.remove("d-none");

  const recordsToRender = [...records].sort((a, b) =>
    getProfileDisplayName(a).localeCompare(getProfileDisplayName(b), undefined, {
      sensitivity: "base",
    }),
  );

  recordsToRender.forEach((profile) => {
    const tenant = getTenantByTenantId(profile.tenant_id);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(getProfileDisplayName(profile))}</div>
        <div class="text-secondary small text-break">${escapeHtml(profile.email || "--")}</div>
      </td>

      <td>
        <span class="badge rounded-pill text-bg-light border">
          ${escapeHtml(profile.role || "--")}
        </span>
      </td>

      <td>${escapeHtml(tenant?.company_name || "Not linked")}</td>

      <td>
        <span class="badge rounded-pill text-bg-light border">
          ${escapeHtml(tenant?.tenant_code || "--")}
        </span>
      </td>

      <td class="text-center">
        <!-- HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2
             Load this profile into the tenant assignment form. -->
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          title="Link user to tenant"
          onclick="window.adminEditProfileTenantLink('${escapeHtml(profile.id)}')"
        >
          <i class="bi bi-pencil-square"></i>
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

async function refreshProfileTenantLinkingWorkspace() {
  renderProfileTenantLinksLoadingState();

  try {
    const supabase = getSupabaseClient();

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2B
    // Use the safe Admin RPC instead of selecting directly from profiles.
    // This avoids adding risky profiles RLS policies that previously broke login.
    const { data, error } = await supabase.rpc(
      "admin_list_profiles_for_tenant_linking",
    );

    if (error) throw error;

    state.profilesForTenantLinking = Array.isArray(data) ? data : [];

    populateProfileTenantProfileOptions();
    populateProfileTenantTenantOptions();
    renderProfileTenantLinks(state.profilesForTenantLinking);
  } catch (error) {
    console.error("Error loading profiles for tenant linking:", error);

    state.profilesForTenantLinking = [];
    renderProfileTenantLinks([]);

    showPageAlert(
      "danger",
      error.message || "User tenant links could not be loaded.",
    );
  }
}

function getProfileForTenantLinkById(profileId = "") {
  const id = String(profileId || "").trim();

  if (!id) return null;

  return (state.profilesForTenantLinking || []).find(
    (profile) => String(profile.id || "").trim() === id,
  ) || null;
}

function startProfileTenantLinkEdit(profileId) {
  const profile = getProfileForTenantLinkById(profileId);

  if (!profile) {
    showPageAlert(
      "warning",
      "The selected user/profile could not be found. Please refresh and try again.",
    );
    return;
  }

  state.currentEditingProfileTenantLink = profile;

  if (state.dom.editingProfileTenantLinkProfileId) {
    state.dom.editingProfileTenantLinkProfileId.value = profile.id || "";
  }

  if (state.dom.profileTenantProfileId) {
    state.dom.profileTenantProfileId.value = profile.id || "";
  }

  if (state.dom.profileTenantTenantId) {
    state.dom.profileTenantTenantId.value = profile.tenant_id || "";
  }

  state.dom.cancelProfileTenantLinkEditBtn?.classList.remove("d-none");

  if (state.dom.saveProfileTenantLinkBtn) {
    state.dom.saveProfileTenantLinkBtn.innerHTML = `
      <i class="bi bi-link-45deg me-2"></i>
      <span id="saveProfileTenantLinkBtnText">Update Tenant Link</span>
    `;
    state.dom.saveProfileTenantLinkBtnText =
      document.getElementById("saveProfileTenantLinkBtnText");
  }

  updateProfileTenantLinkSaveButtonState();

  state.dom.profileTenantTenantId?.focus();
}

async function saveProfileTenantLink() {
  if (!validateProfileTenantLinkForm()) {
    updateProfileTenantLinkSaveButtonState();
    return;
  }

  const profileId = String(state.dom.profileTenantProfileId?.value || "").trim();
  const tenantId = String(state.dom.profileTenantTenantId?.value || "").trim();

  try {
    setProfileTenantLinkSaveLoading(true);

    const supabase = getSupabaseClient();

    // HRP-80 - TENANT / COMPANY LOGIN SEGMENTATION - STEP 1E-2B
    // Use the safe Admin RPC instead of updating profiles directly.
    // This keeps tenant assignment controlled without weakening profile RLS.
    const { error } = await supabase.rpc("admin_assign_profile_to_tenant", {
      target_profile_id: profileId,
      target_tenant_id: tenantId,
    });

    if (error) throw error;

    await refreshProfileTenantLinkingWorkspace();

    showPageAlert(
      "success",
      "User profile was linked to the selected tenant/company successfully.",
    );

    resetProfileTenantLinkForm();
  } catch (error) {
    console.error("Error saving user tenant link:", error);

    showPageAlert(
      "danger",
      error.message || "User tenant link could not be saved.",
    );
  } finally {
    setProfileTenantLinkSaveLoading(false);
  }
}

function renderAdminProfile(profile, user) {
  const fullName = profile?.full_name || "Administrator";
  const email = profile?.email || user?.email || "No email";
  const role = String(profile?.role || "admin").toLowerCase();
  const department = profile?.department || "";

  if (state.dom.adminInitials) {
    state.dom.adminInitials.textContent = getInitials(fullName, "AD");
  }

  if (state.dom.adminEmail) {
    state.dom.adminEmail.textContent = email;
  }

  if (state.dom.adminRole) {
    state.dom.adminRole.textContent = role;
  }

  if (state.dom.adminFullName) {
    state.dom.adminFullName.textContent = fullName;
  }

  if (state.dom.adminEmailTile) {
    state.dom.adminEmailTile.textContent = email;
  }

  if (state.dom.adminRoleTile) {
    state.dom.adminRoleTile.textContent = role;
  }

  if (state.dom.adminDepartment) {
    state.dom.adminDepartment.textContent = department || "--";
  }

  if (state.dom.adminProfileAvatar) {
    state.dom.adminProfileAvatar.textContent = getInitials(fullName, "AD");
  }

  if (state.dom.adminProfileCardName) {
    state.dom.adminProfileCardName.textContent = fullName;
  }

  if (state.dom.adminProfileCardEmail) {
    state.dom.adminProfileCardEmail.textContent = email;
  }

  if (state.dom.adminProfileFullName) {
    state.dom.adminProfileFullName.value = fullName;
  }

  if (state.dom.adminProfileEmail) {
    state.dom.adminProfileEmail.value = email;
  }

  if (state.dom.adminProfileRole) {
    state.dom.adminProfileRole.value = role;
  }

  if (state.dom.adminProfileDepartment) {
    state.dom.adminProfileDepartment.value = department;
  }
}

async function saveAdminOwnProfile() {
  const fullName = String(state.dom.adminProfileFullName?.value || "").trim();
  const department = String(
    state.dom.adminProfileDepartment?.value || "",
  ).trim();

  if (!fullName) {
    showPageAlert(
      "warning",
      "Full name is required before saving your profile.",
    );
    state.dom.adminProfileFullName?.focus();
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

    renderAdminProfile(state.currentProfile, state.currentUser);
    showPageAlert("success", "Your profile was updated successfully.");
  } catch (error) {
    console.error("Error updating admin profile:", error);
    showPageAlert(
      "danger",
      error.message || "Your profile could not be updated.",
    );
  } finally {
    setProfileSaveLoading(false);
  }
}

function setProfileSaveLoading(isLoading) {
  const button = state.dom.saveAdminProfileBtn;
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
