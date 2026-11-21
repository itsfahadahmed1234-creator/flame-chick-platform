import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("apps/flame-chick-admin/accept-invitation.js", "utf8");

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function createHarness({ hash = "", search = "", fetchHandler }) {
  const nodes = new Map();
  const calls = [];
  const location = { pathname: "/accept-invitation.html", search, hash };
  const document = {
    title: "Flame Chick | Accept Staff Invitation",
    getElementById(id) {
      if (!nodes.has(id)) {
        const handlers = {};
        nodes.set(id, {
          id, hidden: false, disabled: false, value: "", textContent: "",
          addEventListener(name, callback) { handlers[name] = callback; },
          async dispatch(name, event = {}) {
            if (handlers[name]) await handlers[name]({ preventDefault() {}, ...event });
          }
        });
      }
      return nodes.get(id);
    }
  };
  const window = {
    FLAME_CHICK_CONFIG: {
      supabaseUrl: "https://test-project.supabase.co",
      publishableKey: "sb_publishable_test_only",
    },
    location
  };
  const history = {
    replaceState(_state, _title, url) {
      const parsed = new URL(url, "https://admin.example.test");
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    }
  };
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return fetchHandler(String(url), options, calls.length);
  };
  for (const id of ["passwordForm", "newPassword", "confirmPassword", "passwordError", "passwordSubmit", "retryAcceptButton", "signinForm", "signinEmail", "signinPassword", "signinError", "signinSubmit", "successRole", "successMessage", "globalError"]) document.getElementById(id);\n  vm.runInNewContext(source, {
    window, document, history, fetch, URL, URLSearchParams,
    String, Number, Math, Date, Promise, Error, console
  });
  return { nodes, calls, location };
}

test("new invite verifies confirmed identity, sets password, then activates role", async () => {
  const calls = [];
  const harness = createHarness({
    hash: "#access_token=invite-access&refresh_token=invite-refresh&type=invite",
    fetchHandler: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/user") && (!options.method || options.method === "GET")) {
        return response({ id: "auth-user-1", email: "new.staff@example.test", email_confirmed_at: "2026-11-21T00:00:00Z" });
      }
      if (url.endsWith("/auth/v1/user") && options.method === "PUT") {
        assert.equal(JSON.parse(options.body).password, "A-Strong-Password-123");
        return response({ id: "auth-user-1" });
      }
      if (url.endsWith("/functions/v1/flame-chick-staff-admin")) {
        assert.equal(JSON.parse(options.body).action, "accept_invitation");
        assert.equal(options.headers.Authorization, "Bearer invite-access");
        return response({ ok: true, result: { role_key: "cashier", status: "accepted" } });
      }
      throw new Error("Unexpected request: " + url);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.nodes.get("inviteState").hidden, false);
  assert.equal(harness.location.hash, "");
  harness.nodes.get("newPassword").value = "A-Strong-Password-123";
  harness.nodes.get("confirmPassword").value = "A-Strong-Password-123";
  await harness.nodes.get("passwordForm").dispatch("submit");
  assert.equal(harness.nodes.get("successState").hidden, false);
  assert.equal(harness.nodes.get("successRole").textContent, "Cashier access is now active.");
  assert.equal(harness.nodes.get("newPassword").value, "");
  assert.equal(calls.filter((x) => x.url.endsWith("/functions/v1/flame-chick-staff-admin")).length, 1);
});

test("existing confirmed account signs in and accepts by authenticated identity", async () => {
  const calls = [];
  const harness = createHarness({
    fetchHandler: async (url, options) => {
      calls.push({ url, options });
      if (url.includes("/auth/v1/token?grant_type=password")) {
        const body = JSON.parse(options.body);
        assert.equal(body.email, "existing.staff@example.test");
        assert.equal(body.password, "Existing-Password-123");
        return response({ access_token: "existing-access", refresh_token: "existing-refresh", expires_in: 3600, token_type: "bearer" });
      }
      if (url.endsWith("/auth/v1/user")) {
        return response({ id: "auth-user-2", email: "existing.staff@example.test", email_confirmed_at: "2026-11-21T00:00:00Z" });
      }
      if (url.endsWith("/functions/v1/flame-chick-staff-admin")) {
        assert.equal(JSON.parse(options.body).action, "accept_invitation");
        assert.equal(options.headers.Authorization, "Bearer existing-access");
        return response({ ok: true, result: { role_key: "rider", status: "accepted" } });
      }
      throw new Error("Unexpected request: " + url);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.nodes.get("signinState").hidden, false);
  harness.nodes.get("signinEmail").value = "existing.staff@example.test";
  harness.nodes.get("signinPassword").value = "Existing-Password-123";
  await harness.nodes.get("signinForm").dispatch("submit");
  assert.equal(harness.nodes.get("successState").hidden, false);
  assert.equal(harness.nodes.get("successRole").textContent, "Rider access is now active.");
  assert.equal(calls.filter((x) => x.url.endsWith("/functions/v1/flame-chick-staff-admin")).length, 1);
});

test("unconfirmed invite identity cannot reach role activation", async () => {
  let functionCalls = 0;
  const harness = createHarness({
    hash: "#access_token=invite-access&refresh_token=invite-refresh&type=invite",
    fetchHandler: async (url) => {
      if (url.endsWith("/auth/v1/user")) return response({ id: "auth-user-3", email: "unconfirmed@example.test" });
      if (url.endsWith("/functions/v1/flame-chick-staff-admin")) { functionCalls++; return response({ ok: true }); }
      throw new Error("Unexpected request: " + url);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.nodes.get("signinState").hidden, false);
  assert.match(harness.nodes.get("signinError").textContent, /did not confirm|not confirmed/i);
  assert.equal(functionCalls, 0);
});

test("password mismatch is rejected before any Auth password update", async () => {
  let putCalls = 0;
  const harness = createHarness({
    hash: "#access_token=invite-access&refresh_token=invite-refresh&type=invite",
    fetchHandler: async (url, options) => {
      if (url.endsWith("/auth/v1/user") && (!options.method || options.method === "GET")) {
        return response({ id: "auth-user-4", email: "staff@example.test", email_confirmed_at: "2026-11-21T00:00:00Z" });
      }
      if (url.endsWith("/auth/v1/user") && options.method === "PUT") { putCalls++; return response({}); }
      throw new Error("Unexpected request: " + url);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.nodes.get("newPassword").value = "A-Strong-Password-123";
  harness.nodes.get("confirmPassword").value = "Different-Password-123";
  await harness.nodes.get("passwordForm").dispatch("submit");
  assert.match(harness.nodes.get("passwordError").textContent, /do not match/i);
  assert.equal(putCalls, 0);
});

test("failed activation offers retry and does not claim success", async () => {
  let functionCalls = 0;
  const harness = createHarness({
    hash: "#access_token=invite-access&refresh_token=invite-refresh&type=invite",
    fetchHandler: async (url, options) => {
      if (url.endsWith("/auth/v1/user") && (!options.method || options.method === "GET")) {
        return response({ id: "auth-user-5", email: "retry@example.test", email_confirmed_at: "2026-11-21T00:00:00Z" });
      }
      if (url.endsWith("/auth/v1/user") && options.method === "PUT") return response({ id: "auth-user-5" });
      if (url.endsWith("/functions/v1/flame-chick-staff-admin")) {
        functionCalls++;
        return functionCalls === 1
          ? response({ ok: false, error: { message: "Invitation is not active yet." } }, 400)
          : response({ ok: true, result: { role_key: "manager", status: "accepted" } });
      }
      throw new Error("Unexpected request: " + url);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.nodes.get("newPassword").value = "A-Strong-Password-123";
  harness.nodes.get("confirmPassword").value = "A-Strong-Password-123";
  await harness.nodes.get("passwordForm").dispatch("submit");
  assert.equal(harness.nodes.get("retryAcceptButton").hidden, false);
  assert.equal(harness.nodes.get("successState").hidden, true);
  await harness.nodes.get("retryAcceptButton").dispatch("click");
  assert.equal(harness.nodes.get("successState").hidden, false);
  assert.equal(functionCalls, 2);
});
