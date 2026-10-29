const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

test("login redirects follow the last authenticated role", () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/auth-token.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const values = new Map();
  vm.runInNewContext(compiled, { exports, window: {}, localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  assert.equal(exports.getLoginPath(), "/login");
  exports.rememberLoginRole("admin");
  assert.equal(exports.getLoginPath(), "/admin/login");
  exports.rememberLoginRole("user");
  assert.equal(exports.getLoginPath(), "/login");
});
