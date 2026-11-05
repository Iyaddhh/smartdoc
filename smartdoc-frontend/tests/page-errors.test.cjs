const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./helpers.cjs");
const errors = load("../lib/page-errors.ts");

function component(file, overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, window: overrides.window,
    require: (name) => {
      if (name === "@/lib/page-errors") return errors;
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === "@/components/errors/ErrorScreen") return { default: ErrorScreen };
      return require(name);
    },
  });
  return exports.default;
}
const ErrorScreen = component("../components/errors/ErrorScreen.tsx");

test("authentication distinguishes session expiry, forbidden, server and availability failures", () => {
  assert.equal(errors.authPageError(401), null);
  assert.equal(errors.authPageError(403), 403);
  assert.equal(errors.authPageError(500), 500);
  for (const code of [0, 429, 502, 503, 504]) assert.equal(errors.authPageError(code), 503);
});

test("all error screens expose a heading, safe home navigation and noindex without auth context", () => {
  for (const status of [403, 404, 500, 503]) {
    const html = renderToStaticMarkup(React.createElement(ErrorScreen, { status }));
    assert.match(html, /<main[^>]*aria-labelledby="error-page-title"/);
    assert.match(html, /<h1 id="error-page-title">/);
    assert.ok(html.includes(errors.pageErrors[status].title));
    assert.match(html, /href="\/"/);
    assert.match(html, /noindex, nofollow/);
  }
});

test("root and global boundaries conceal error details and prefer framework retry", () => {
  for (const file of ["../app/error.tsx", "../app/global-error.tsx"]) {
    let retries = 0;
    let resets = 0;
    const Boundary = component(file);
    const element = Boundary({ error: new Error("SYNTHETIC_PRIVATE_TOKEN_AND_PATH"), retry: () => retries++, reset: () => resets++ });
    const screen = file.includes("global-error") ? element.props.children.find(child => child.type === "body").props.children : element;
    screen.props.onRetry();
    assert.equal(retries, 1);
    assert.equal(resets, 0);
    const html = renderToStaticMarkup(element);
    assert.ok(!html.includes("SYNTHETIC_PRIVATE_TOKEN_AND_PATH"));
    assert.ok(html.includes("Terjadi kesalahan"));
    if (file.includes("global-error")) { assert.match(html, /<html lang="id">/); assert.match(html, /<body/); }
  }
});

test("error retry supports reset fallback and busy recovery feedback", () => {
  let resets = 0;
  const Boundary = component("../app/error.tsx");
  Boundary({ error: null, reset: () => resets++ }).props.onRetry();
  assert.equal(resets, 1);
  const html = renderToStaticMarkup(React.createElement(ErrorScreen, { status: 503, busy: true, onRetry() {} }));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-live="polite"/);
  assert.ok(html.includes("Sedang memeriksa ketersediaan layanan."));
});
