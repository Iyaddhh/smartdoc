const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const { validatePageSelection } = load("../lib/page-selection.ts");

test("page selection accepts whitespace and deduplicates overlapping ranges", () => {
  const selection = validatePageSelection(" 2 - 4 , 2,1 ", 5);
  assert.equal(selection.error, "");
  assert.deepEqual(Array.from(selection.pages), [1, 2, 3, 4]);
});

test("invalid segments reject the entire selection instead of selecting a partial range", () => {
  for (const expression of ["", "0", "1-6", "4-2", "1,bad", "1,", "-1", "1-2-3", "1.5", "9007199254740992"]) {
    const selection = validatePageSelection(expression, 5);
    assert.notEqual(selection.error, "", expression);
    assert.equal(selection.pages.length, 0, expression);
  }
});

test("selection validates syntax before preview metadata is available without expanding large ranges", () => {
  assert.equal(validatePageSelection("1-999999999").error, "");
  assert.equal(validatePageSelection("1-999999999").pages.length, 0);
  assert.notEqual(validatePageSelection("1,bad").error, "");
  assert.notEqual(validatePageSelection("4-2").error, "");
  assert.notEqual(validatePageSelection("0").error, "");
  assert.notEqual(validatePageSelection("1-999999999", 5).error, "");
});
