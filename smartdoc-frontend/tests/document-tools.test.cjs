const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const { availableDocumentTools } = load("../lib/document-tools.ts");

test("workspace tools match supported source formats", () => {
  for (const format of ["pdf", "docx", ".PDF"]) assert.equal(availableDocumentTools(format).length, 5);
  for (const format of ["png", "jpeg", "xlsx", "pptx"]) {
    assert.deepEqual(Array.from(availableDocumentTools(format)), ["converter", "compressor", "merger"]);
  }
  for (const format of ["zip", "exe", ""]) assert.equal(availableDocumentTools(format).length, 0);
});
