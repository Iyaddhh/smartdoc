const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

test("JSON client preserves body and headers without exposing bearer tokens", async () => {
  let request;
  const client = load("../lib/api/client.ts", { require: () => ({ sessionFetch: async (url, init) => {
    request = { url, ...init };
    return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
  } }) });
  await client.apiFetch("/api/documents/example", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"custom_name":"test.pdf"}' });
  assert.equal(request.headers.get("Authorization"), null);
  assert.equal(request.headers.get("Content-Type"), "application/json");
  assert.equal(request.body, '{"custom_name":"test.pdf"}');
});

test("file downloads use the shared session transport", async () => {
  let unauthorized = 0;
  const files = load("../lib/api/files.ts", { require: () => ({ handleUnauthorized: () => { unauthorized += 1; },
    sessionFetch: async () => ({ ok: false, status: 401, json: async () => ({ message: "Sesi berakhir" }) }),
  }) });
  await assert.rejects(files.fetchFile("/api/documents/id/download"), /Sesi berakhir/);
  assert.equal(unauthorized, 1);
});

test("expired access refreshes cookies once and retries with the new CSRF token", async () => {
  let calls = 0;
  let refreshes = 0;
  let cookie = "smartdoc_csrf=old";
  const requests = [];
  const session = load("../lib/session.ts", {
    window: {}, navigator: {}, document: { get cookie() { return cookie; } },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url === "/api/auth/refresh") { refreshes += 1; cookie = "smartdoc_csrf=new"; return { ok: true, status: 200 }; }
      calls += 1;
      return { ok: calls > 2, status: calls > 2 ? 200 : 401 };
    },
  });
  const response = await session.sessionFetch("/api/workspace/folders", { method: "POST", body: "original" });
  assert.equal(response.status, 200);
  assert.equal(refreshes, 1);
  assert.equal(requests.at(-1).init.headers.get("X-CSRF-Token"), "new");
  assert.equal(requests.at(-1).init.body, "original");
  assert.ok(requests.every((r) => r.init.credentials === "include"));
  assert.ok(requests.every((r) => !r.init.headers.has("Authorization")));
});

test("simultaneous API failures share one refresh in the same tab", async () => {
  let refreshed = false;
  let refreshes = 0;
  const session = load("../lib/session.ts", {
    window: {}, navigator: {}, document: { cookie: "smartdoc_csrf=token" },
    fetch: async (url) => {
      if (url === "/api/auth/refresh") { refreshes += 1; await new Promise((resolve) => setTimeout(resolve, 5)); refreshed = true; return { ok: true, status: 200 }; }
      return { ok: refreshed, status: refreshed ? 200 : 401 };
    },
  });
  const responses = await Promise.all([session.sessionFetch("/api/workspace/items"), session.sessionFetch("/api/workspace/summary")]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(refreshes, 1);
});

test("anonymous session checks return 401 without a refresh or CSRF request", async () => {
  const requests = [];
  const session = load("../lib/session.ts", {
    window: {}, navigator: {}, document: { cookie: "" },
    fetch: async (url) => {
      requests.push(url);
      return { ok: false, status: 401, headers: new Headers({ "X-Session-Refresh": "unavailable" }) };
    },
  });
  assert.equal((await session.sessionFetch("/api/auth/me")).status, 401);
  assert.deepEqual(requests, ["/api/auth/me"]);
});


test("authenticated home routes separate admin from personal workspace", () => {
  const routes = load("../lib/auth-token.ts");
  assert.equal(routes.getHomePath("admin"), "/administration");
  assert.equal(routes.getHomePath("user"), "/dashboard");
});
