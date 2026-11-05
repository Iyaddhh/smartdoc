const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

function validator(imageResult = { width: 10000, height: 10000 }) {
  let revoked = 0;
  const format = load("../lib/format.ts");
  const validation = load("../lib/file-validation.ts", {
    require: () => format,
    Image: class {
      set src(value) {
        Object.assign(this, imageResult);
        queueMicrotask(() => imageResult.error ? this.onerror() : this.onload());
      }
    },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => { revoked += 1; } },
  });
  return { ...validation, revoked: () => revoked };
}

test("uploads enforce category limits, empty files and accepted extensions", async () => {
  const { validateUpload } = validator();
  const options = { accept: ".pdf,.png", maxSizeMB: 50 };
  for (const file of [
    { name: "empty.pdf", size: 0 },
    { name: "photo.png", size: 12 * 1024 * 1024 + 1 },
    { name: "document.pdf", size: 35 * 1024 * 1024 + 1 },
    { name: "script.exe", size: 100 },
  ]) assert.equal((await validateUpload(file, options)).valid, false);
  assert.equal((await validateUpload({ name: "DOCUMENT.PDF", size: 35 * 1024 * 1024 }, options)).valid, true);
  assert.equal((await validateUpload({ name: "small.pdf", size: 2 * 1024 * 1024 }, { maxSizeMB: 1 })).valid, false);
});

test("both image entry points reject oversized/corrupt images and release Blob URLs", async () => {
  for (const result of [{ width: 10000, height: 10000 }, { width: 10001, height: 100 }, { error: true }]) {
    const validation = validator(result);
    const file = { name: "photo.PNG", size: 1024 };
    const expected = !result.error && result.width <= 10000;
    assert.equal((await validation.validateImageFile(file)).valid, expected);
    assert.equal((await validation.validateUpload(file)).valid, expected);
    assert.equal(validation.revoked(), 2);
  }
});

test("PPTX compression accepts 200 MB inclusive and preserves other category limits", async () => {
  const { validateUpload } = validator();
  const options = { accept: ".pptx,.docx,.pdf,.png", maxSizeMB: 200, allowLargePptx: true };
  assert.equal((await validateUpload({ name: "SLIDES.PPTX", size: 200 * 1024 * 1024 }, options)).valid, true);
  const oversized = await validateUpload({ name: "slides.pptx", size: 200 * 1024 * 1024 + 1 }, options);
  assert.equal(oversized.valid, false);
  assert.match(oversized.error, /200 MB/);
  for (const name of ["document.pdf", "document.docx"]) {
    assert.equal((await validateUpload({ name, size: 35 * 1024 * 1024 + 1 }, options)).valid, false);
  }
  assert.equal((await validateUpload({ name: "photo.png", size: 12 * 1024 * 1024 + 1 }, options)).valid, false);
  assert.equal((await validateUpload({ name: "slides.pptx", size: 36 * 1024 * 1024 })).valid, false);
});
