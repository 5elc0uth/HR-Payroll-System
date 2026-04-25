document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const alertContainer = document.getElementById("loginAlertContainer");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const togglePasswordIcon = document.getElementById("togglePasswordIcon");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");

  const SUPABASE_URL = "https://zoeglonuxkiwnaabzjqo.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_zNz3vsLoaw9ul1UmwEDAMg_YX-MxMG_";

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  );

  window.SUPABASE_URL = "https://zoeglonuxkiwnaabzjqo.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_zNz3vsLoaw9ul1UmwEDAMg_YX-MxMG_";

  const supabaseClient = window.supabaseClient;

  function showAlert(message, type) {
    if (!alertContainer) return;

    alertContainer.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  }

  function clearValidationStates() {
    if (emailInput) emailInput.classList.remove("is-invalid");
    if (passwordInput) passwordInput.classList.remove("is-invalid");
  }

  /* =========================================================
     Role-to-dashboard routing
     ---------------------------------------------------------
     US010 adds the manager / supervisor dashboard route.
     This is kept minimal so existing role routing stays intact.
  ========================================================= */
  function getDashboardByRole(role) {
    const roleRoutes = {
      employee: "/employee-dashboard.html",
      manager: "/manager-dashboard.html",
      supervisor: "/manager-dashboard.html",
      hr: "/hr-dashboard.html",
      payroll: "/payroll-dashboard.html",
      executive: "/executive-dashboard.html",
      admin: "/admin-dashboard.html",
      auditor: "/auditor-dashboard.html",
      hr_manager: "/hr-dashboard.html",
      accountant: "/accountant-dashboard.html",
      business_owner: "/business-owner-dashboard.html",
    };

    return roleRoutes[role] || "/index.html";
  }

  async function handleForgotPassword(event) {
    event.preventDefault();

    if (!emailInput) return;

    clearValidationStates();
    alertContainer.innerHTML = "";

    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
      emailInput.classList.add("is-invalid");
      showAlert(
        "Enter your email address first, then click Forgot password again.",
        "warning",
      );
      return;
    }

    const resetRedirectUrl = `${window.location.origin}/reset-password.html?mode=recovery`;

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: resetRedirectUrl,
      });

      if (error) {
        showAlert(
          error.message || "Password reset request could not be sent.",
          "danger",
        );
        return;
      }

      showAlert(
        `A password reset link has been sent to <strong>${email}</strong>. Please check your inbox.`,
        "success",
      );
    } catch (error) {
      console.error("Forgot password error:", error);
      showAlert(
        "An unexpected error occurred while sending reset email.",
        "danger",
      );
    }
  }

  function showMessageFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("message");

    if (!message) return;

    switch (message) {
      case "session-timeout":
        showAlert(
          "Your session expired due to inactivity. Please sign in again.",
          "warning",
        );
        break;
      case "session-expired":
        showAlert("Your session has expired. Please sign in again.", "warning");
        break;
      case "unauthorized":
        showAlert("You are not authorized to access that page.", "danger");
        break;
      case "password-reset-success":
        showAlert(
          "Your password has been reset successfully. You can now sign in.",
          "success",
        );
        break;
      case "first-time-setup-success":
        showAlert(
          "Your account setup is complete. Please sign in with your new password.",
          "success",
        );
        break;
      default:
        break;
    }
  }

  if (togglePasswordBtn && passwordInput && togglePasswordIcon) {
    togglePasswordBtn.addEventListener("click", function () {
      const isPasswordHidden =
        passwordInput.getAttribute("type") === "password";

      passwordInput.setAttribute(
        "type",
        isPasswordHidden ? "text" : "password",
      );

      togglePasswordIcon.className = isPasswordHidden
        ? "bi bi-eye-slash"
        : "bi bi-eye";
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", handleForgotPassword);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      clearValidationStates();
      alertContainer.innerHTML = "";

      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;

      let isValid = true;

      if (!email) {
        emailInput.classList.add("is-invalid");
        isValid = false;
      }

      if (!password) {
        passwordInput.classList.add("is-invalid");
        isValid = false;
      }

      if (!isValid) {
        showAlert("Please enter both email and password.", "warning");
        return;
      }

      const submitButton = loginForm.querySelector("button[type='submit']");
      const originalButtonHtml = submitButton.innerHTML;

      submitButton.disabled = true;
      submitButton.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Signing In...`;

      try {
        const { data: authData, error: authError } =
          await supabaseClient.auth.signInWithPassword({
            email,
            password,
          });

        if (authError) {
          showAlert(
            authError.message || "Invalid credentials. Please try again.",
            "danger",
          );
          return;
        }

        if (!authData || !authData.user) {
          showAlert(
            "Sign-in could not be completed. Please try again.",
            "danger",
          );
          return;
        }

        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select(
            "id, email, full_name, role, department, is_active, must_change_password",
          )
          .eq("id", authData.user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError);
          showAlert(
            "You signed in successfully, but your profile record could not be found. Please contact support.",
            "warning",
          );
          return;
        }

        if (!profile) {
          showAlert(
            "You signed in successfully, but no profile is attached to your account.",
            "warning",
          );
          return;
        }

        if (profile.is_active === false) {
          showAlert(
            "Your account is inactive. Please contact support.",
            "danger",
          );
          await supabaseClient.auth.signOut();
          return;
        }

        localStorage.setItem(
          "hrPayrollSession",
          JSON.stringify({
            userId: authData.user.id,
            email: profile.email || authData.user.email,
            fullName: profile.full_name || "",
            role: profile.role,
            department: profile.department || "",
            loginTime: new Date().toISOString(),
          }),
        );

        if (profile.must_change_password === true) {
          showAlert(
            "First-time setup required. Redirecting you to set a new password...",
            "warning",
          );

          setTimeout(function () {
            window.location.href = "/reset-password.html?mode=first-time";
          }, 1200);

          return;
        }

        if (!profile) {
          showAlert(
            "You signed in successfully, but no profile is attached to your account.",
            "warning",
          );
          return;
        }

        if (profile.is_active === false) {
          showAlert(
            "Your account is inactive. Please contact support.",
            "danger",
          );
          await supabaseClient.auth.signOut();
          return;
        }

        if (profile.must_change_password === true) {
          showAlert(
            "First-time setup required. Redirecting you to set a new password...",
            "warning",
          );

          setTimeout(function () {
            window.location.href = "/reset-password.html?mode=first-time";
          }, 1200);

          return;
        }

        const redirectTarget = getDashboardByRole(profile.role);

        showAlert(
          `Sign-in successful. Welcome <strong>${profile.full_name || authData.user.email}</strong>. Role detected: <strong>${profile.role}</strong>. Redirecting...`,
          "success",
        );

        console.log("Supabase sign-in success:", {
          userId: authData.user.id,
          email: profile.email || authData.user.email,
          role: profile.role,
          redirectTarget,
          source: "profiles.role",
        });

        setTimeout(function () {
          window.location.href = redirectTarget;
        }, 1200);
      } catch (unexpectedError) {
        console.error("Unexpected sign-in error:", unexpectedError);
        showAlert("An unexpected error occurred while signing in.", "danger");
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHtml;
      }
    });
  }

  showMessageFromQueryString();
});
