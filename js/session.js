// js/session.js

(function () {
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  let idleTimer = null;
  let activityListenersAttached = false;
  let authListenerAttached = false;

  function getSupabaseClient() {
    // Single agreed global client name for the whole app
    if (!window.supabaseClient) {
      console.error("Supabase client is not available on window.supabaseClient");
      return null;
    }
    return window.supabaseClient;
  }

  async function getSession() {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Error getting session:", error.message);
      return null;
    }

    return data?.session || null;
  }

  async function getUser() {
    const session = await getSession();
    return session?.user || null;
  }

  /* =========================================================
     Expanded profile fetch
     ---------------------------------------------------------
     Safe expansion for manager dashboard and future stories.
     Existing pages that only need a subset will continue to work.
  ========================================================= */
  async function getProfile(userId) {
    const supabase = getSupabaseClient();
    if (!supabase || !userId) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, email, full_name, role, department, is_active, must_change_password",
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error.message);
      return null;
    }

    return data;
  }

  async function logoutUser(reason = "logout") {
    const supabase = getSupabaseClient();

    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("Error during logout:", error);
    }

    if (reason === "timeout") {
      window.location.href = "index.html?message=session-timeout";
      return;
    }

    if (reason === "expired") {
      window.location.href = "index.html?message=session-expired";
      return;
    }

    if (reason === "unauthorized") {
      window.location.href = "index.html?message=unauthorized";
      return;
    }

    window.location.href = "index.html";
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer() {
    clearIdleTimer();

    idleTimer = setTimeout(async () => {
      alert("You have been logged out due to inactivity.");
      await logoutUser("timeout");
    }, IDLE_TIMEOUT_MS);
  }

  function attachActivityListeners() {
    if (activityListenersAttached) return;

    const events = [
      "mousemove",
      "mousedown",
      "click",
      "scroll",
      "keypress",
      "touchstart",
    ];

    events.forEach((eventName) => {
      document.addEventListener(eventName, resetIdleTimer, true);
    });

    activityListenersAttached = true;
  }

  function startIdleTimeout() {
    attachActivityListeners();
    resetIdleTimer();
  }

  function stopIdleTimeout() {
    clearIdleTimer();
  }

  /* =========================================================
     Central role redirect
     ---------------------------------------------------------
     US010 adds manager / supervisor support.
  ========================================================= */
  function redirectToRoleDashboard(role) {
    switch (role) {
      case "admin":
        window.location.href = "admin-dashboard.html";
        break;
      case "employee":
        window.location.href = "employee-dashboard.html";
        break;
      case "manager":
      case "supervisor":
        window.location.href = "manager-dashboard.html";
        break;
      case "hr_manager":
      case "hr":
        window.location.href = "hr-dashboard.html";
        break;
      default:
        window.location.href = "index.html?message=no-role-dashboard";
        break;
    }
  }

  async function requireAuth() {
    const session = await getSession();

    if (!session) {
      await logoutUser("expired");
      return null;
    }

    return session;
  }

  /* =========================================================
     Flexible role matching
     ---------------------------------------------------------
     Supports:
     - single role string, e.g. "employee"
     - multiple roles array, e.g. ["manager", "supervisor"]
  ========================================================= */
  function roleMatches(expectedRole, actualRole) {
    if (!expectedRole) return true;

    if (Array.isArray(expectedRole)) {
      return expectedRole.includes(actualRole);
    }

    return actualRole === expectedRole;
  }

  async function requireRole(expectedRole) {
    const session = await requireAuth();
    if (!session) return null;

    const profile = await getProfile(session.user.id);

    if (!profile) {
      await logoutUser("unauthorized");
      return null;
    }

    // Optional first-time password enforcement
    if (profile.must_change_password === true) {
      if (!window.location.pathname.endsWith("reset-password.html")) {
        window.location.href = "reset-password.html";
        return null;
      }
    }

    if (!roleMatches(expectedRole, profile.role)) {
      redirectToRoleDashboard(profile.role);
      return null;
    }

    return { session, profile };
  }

  async function protectPage(expectedRole = null) {
    const result = await requireRole(expectedRole);
    if (!result) return null;

    startIdleTimeout();
    attachAuthStateListener();

    return result;
  }

  function attachAuthStateListener() {
    if (authListenerAttached) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        stopIdleTimeout();
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        resetIdleTimer();
      }
    });

    authListenerAttached = true;
  }

  window.SessionManager = {
    getSession,
    getUser,
    getProfile,
    requireAuth,
    requireRole,
    protectPage,
    startIdleTimeout,
    stopIdleTimeout,
    resetIdleTimer,
    logoutUser,
    redirectToRoleDashboard,
  };
})();