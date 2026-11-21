(() => {
  "use strict";

  const C = window.FLAME_CHICK_CONFIG || {};
  const SUPABASE_URL = String(C.supabaseUrl || "").replace(/\/+$/, "");
  const API_KEY = String(C.publishableKey || "");
  const $ = (id) => document.getElementById(id);

  let session = null;
  let currentUser = null;
  let passwordWasSet = false;

  function show(id) {
    ["loadingState", "inviteState", "signinState", "successState"].forEach((name) => {
      const node = $(name);
      if (node) node.hidden = name !== id;
    });
  }

  function showError(id, message) {
    const node = $(id);
    if (!node) return;
    node.textContent = String(message || "The request could not be completed.");
    node.hidden = false;
  }

  function clearError(id) {
    const node = $(id);
    if (node) {
      node.textContent = "";
      node.hidden = true;
    }
  }

  function cleanRedirectUrl() {
    // Tokens are received in the URL fragment; remove them before any further navigation.
    try {
      history.replaceState(null, document.title, window.location.pathname);
    } catch (_) {
      window.location.hash = "";
    }
  }

  function readAuthRedirect() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const get = (name) => hash.get(name) || query.get(name) || "";
    const result = {
      access_token: get("access_token"),
      refresh_token: get("refresh_token"),
      token_type: get("token_type"),
      type: get("type"),
      expires_in: get("expires_in"),
      expires_at: get("expires_at"),
      error: get("error"),
      error_code: get("error_code"),
      error_description: get("error_description")
    };
    cleanRedirectUrl();
    return result;
  }

  function normalizeSession(raw) {
    const expiresIn = Math.max(60, Number(raw.expires_in) || 3600);
    const suppliedExpiry = Number(raw.expires_at);
    return {
      access_token: String(raw.access_token || ""),
      refresh_token: String(raw.refresh_token || ""),
      token_type: String(raw.token_type || "bearer"),
      expires_at: suppliedExpiry > 0
        ? (suppliedExpiry < 100000000000 ? suppliedExpiry * 1000 : suppliedExpiry)
        : Date.now() + expiresIn * 1000
    };
  }

  function ensureConfigured() {
    if (!SUPABASE_URL || !API_KEY) {
      throw new Error("Flame Chick authentication is not configured on this page.");
    }
  }

  async function parseResponse(response) {
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      data = {};
    }
    if (!response.ok) {
      const message = data.msg || data.message || data.error_description ||
        (data.error && data.error.message) ||
        "The request could not be completed. Please try again.";
      throw new Error(String(message));
    }
    return data;
  }

  async function authRequest(path, method, body, accessToken) {
    const headers = { apikey: API_KEY, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    const response = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
      method: method || "GET",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    return parseResponse(response);
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) {
      throw new Error("Your invitation session has expired. Sign in with your account and accept the invitation again.");
    }
    const fresh = await authRequest("token?grant_type=refresh_token", "POST", {
      refresh_token: session.refresh_token
    });
    session = normalizeSession(fresh);
  }

  async function ensureFreshSession() {
    if (!session || !session.access_token) throw new Error("Please sign in to accept your invitation.");
    if (session.expires_at <= Date.now() + 60000) await refreshSession();
  }

  async function getAuthenticatedUser() {
    await ensureFreshSession();
    try {
      currentUser = await authRequest("user", "GET", undefined, session.access_token);
      return currentUser;
    } catch (error) {
      if (String(error.message).toLowerCase().includes("jwt") ||
          String(error.message).toLowerCase().includes("token") ||
          String(error.message).toLowerCase().includes("expired")) {
        await refreshSession();
        currentUser = await authRequest("user", "GET", undefined, session.access_token);
        return currentUser;
      }
      throw error;
    }
  }

  function emailIsConfirmed(user) {
    return !!(user && (user.email_confirmed_at || user.confirmed_at));
  }

  async function acceptInvitation() {
    await ensureFreshSession();
    const user = await getAuthenticatedUser();
    if (!emailIsConfirmed(user)) {
      throw new Error("Your email address is not confirmed. Use the confirmation link sent by Supabase Auth, then return here.");
    }

    const response = await fetch(SUPABASE_URL + "/functions/v1/flame-chick-staff-admin", {
      method: "POST",
      headers: {
        apikey: API_KEY,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ action: "accept_invitation" }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    const data = await parseResponse(response);
    if (data.ok !== true) {
      throw new Error(data.error && data.error.message ? data.error.message : "The invitation could not be activated.");
    }
    const result = data.result && typeof data.result === "object" ? data.result : {};
    showSuccess(result);
  }

  function showSuccess(result) {
    const role = String(result.role_key || "").toLowerCase();
    const labels = { admin: "Admin", owner: "Owner", manager: "Manager", cashier: "Cashier", rider: "Rider" };
    $("successRole").textContent = role && labels[role]
      ? labels[role] + " access is now active."
      : "Your staff access is now active.";
    $("successMessage").textContent = result.idempotent
      ? "This invitation was already accepted. Your existing access remains active."
      : "Your invitation has been accepted and your assigned role is now active.";
    session = null;
    currentUser = null;
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    $("signinPassword").value = "";
    show("successState");
  }

  async function submitNewPassword(event) {
    event.preventDefault();
    clearError("passwordError");
    const password = $("newPassword").value;
    const confirm = $("confirmPassword").value;
    if (password.length < 12) {
      showError("passwordError", "Use a password with at least 12 characters.");
      return;
    }
    if (password.length > 128) {
      showError("passwordError", "The password is too long.");
      return;
    }
    if (password !== confirm) {
      showError("passwordError", "The passwords do not match.");
      return;
    }
    const button = $("passwordSubmit");
    button.disabled = true;
    button.textContent = "Setting password…";
    try {
      await ensureFreshSession();
      const user = await getAuthenticatedUser();
      if (!emailIsConfirmed(user)) {
        throw new Error("The invitation email has not been confirmed. Please use the latest invitation link.");
      }
      await authRequest("user", "PUT", { password }, session.access_token);
      passwordWasSet = true;
      button.hidden = true;
      $("newPassword").disabled = true;
      $("confirmPassword").disabled = true;
      button.textContent = "Password saved";
      try {
        await acceptInvitation();
      } catch (error) {
        showError("passwordError", "Your password was saved, but access is not active yet: " + error.message);
        $("retryAcceptButton").hidden = false;
      }
    } catch (error) {
      showError("passwordError", error.message);
    } finally {
      button.disabled = false;
      if (!passwordWasSet) button.textContent = "Set password and activate access";
    }
  }

  async function retryAccept() {
    clearError("passwordError");
    const button = $("retryAcceptButton");
    button.disabled = true;
    button.textContent = "Activating…";
    try {
      await acceptInvitation();
    } catch (error) {
      showError("passwordError", error.message);
    } finally {
      button.disabled = false;
      if ($("successState").hidden) button.textContent = "Retry activation";
    }
  }

  async function submitExistingAccount(event) {
    event.preventDefault();
    clearError("signinError");
    const email = $("signinEmail").value.trim().toLowerCase();
    const password = $("signinPassword").value;
    if (!email || !password) {
      showError("signinError", "Enter the invited email address and your current password.");
      return;
    }
    const button = $("signinSubmit");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const signedIn = await authRequest("token?grant_type=password", "POST", { email, password });
      session = normalizeSession(signedIn);
      const user = await getAuthenticatedUser();
      if (!emailIsConfirmed(user)) {
        throw new Error("This account's email address is not confirmed. Confirm it before accepting staff access.");
      }
      await acceptInvitation();
    } catch (error) {
      session = null;
      currentUser = null;
      showError("signinError", error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Sign in and accept invitation";
    }
  }

  async function init() {
    try {
      ensureConfigured();
      const auth = readAuthRedirect();
      if (auth.error || auth.error_code) {
        const message = auth.error_description || auth.error_code || auth.error || "The invitation link could not be verified.";
        show("signinState");
        showError("signinError", message + " If you already have a confirmed Flame Chick account, sign in below to accept the recorded invitation.");
        return;
      }

      if (auth.access_token && auth.refresh_token && auth.type === "invite") {
        session = normalizeSession(auth);
        const user = await getAuthenticatedUser();
        if (!emailIsConfirmed(user)) {
          throw new Error("The invitation link did not confirm this email address. Please ask an Admin or Owner to issue a fresh invitation.");
        }
        $("inviteEmail").textContent = String(user.email || "");
        show("inviteState");
        return;
      }

      show("signinState");
    } catch (error) {
      show("signinState");
      showError("signinError", error.message);
    }
  }

  $("passwordForm").addEventListener("submit", submitNewPassword);
  $("signinForm").addEventListener("submit", submitExistingAccount);
  $("retryAcceptButton").addEventListener("click", retryAccept);
  init();
})();
