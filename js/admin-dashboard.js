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
    switchAdminWorkspace("profile");
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
    adminProfileSection: document.getElementById("adminProfileSection"),
    adminOverviewSection: document.getElementById("adminOverviewSection"),

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

  state.dom.adminProfileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveAdminOwnProfile();
  });
}

function switchAdminWorkspace(workspace) {
  const isProfile = workspace === "profile";

  state.dom.adminProfileSection?.classList.toggle("d-none", !isProfile);
  state.dom.adminOverviewSection?.classList.toggle("d-none", isProfile);

  state.dom.adminTabProfileBtn.className = isProfile
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-outline-primary dashboard-action-btn";

  state.dom.adminTabOverviewBtn.className = !isProfile
    ? "btn btn-primary dashboard-action-btn"
    : "btn btn-outline-primary dashboard-action-btn";

  if (state.dom.adminModuleValue) {
    state.dom.adminModuleValue.textContent = isProfile
      ? "Profile"
      : "Administrative Overview";
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
