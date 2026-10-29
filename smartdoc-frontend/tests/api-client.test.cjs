const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

test("JSON request headers preserve Bearer auth and the request body", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/api/client.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let request;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Headers, process,
    require: () => ({ getToken: () => "test-token" }),
    fetch: async (url, init) => {
      request = { url, ...init };
      return { ok: true, status: 200, json: async () => ({ success: true, data: null, message: "OK", error: null }) };
    },
  });
  for (const headers of [{ "Content-Type": "application/json" }, new Headers({ "Content-Type": "application/json" })]) {
    await exports.apiFetch("/api/documents/example", { method: "PATCH", headers, body: '{"custom_name":"test.pdf"}' });
    assert.equal(request.headers.get("Authorization"), "Bearer test-token");
    assert.equal(request.headers.get("Content-Type"), "application/json");
    assert.equal(request.method, "PATCH");
    assert.equal(request.body, '{"custom_name":"test.pdf"}');
  }
});

test("an expired session is handled for file downloads", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/api/files.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let unauthorized = 0;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ getToken: () => "expired-token", handleUnauthorized: () => { unauthorized += 1; } }),
    fetch: async () => ({ ok: false, status: 401, json: async () => ({ message: "Sesi berakhir" }) }),
    AbortSignal,
  });
  await assert.rejects(exports.fetchFile("/api/documents/id/download"), /Sesi berakhir/);
  assert.equal(unauthorized, 1);
});

test("a late 401 cannot clear a newer login", () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/auth-token.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const values = new Map([["smartdoc_access_token", "new-token"]]);
  const exports = {};
  let redirects = 0;
  vm.runInNewContext(compiled, {
    exports,
    window: { dispatchEvent: () => {}, location: { pathname: "/dashboard", set href(value) { redirects += 1; } } },
    localStorage: { getItem: (key) => values.get(key) ?? null, removeItem: (key) => values.delete(key) },
    Event,
  });
  exports.handleUnauthorized("old-token");
  assert.equal(values.get("smartdoc_access_token"), "new-token");
  assert.equal(redirects, 0);
});
