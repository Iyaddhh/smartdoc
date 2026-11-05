const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

test("guest previews use public API without credentials and share the same upload", async () => {
  const requests = [];
  const { previewGuestFile } = load("../lib/guest-api.ts", {
    FormData,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ success: true, data: { total_pages: 2, thumbnails: [] } }) };
    },
  });
  const file = new File(["pdf"], "source.pdf");
  const [first, second] = await Promise.all([previewGuestFile(file), previewGuestFile(file)]);
  assert.equal(first.data.total_pages, 2);
  assert.equal(first, second);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/guest/preview");
  assert.equal(requests[0].options.credentials, "omit");
  assert.equal(requests[0].options.body.get("file").name, "source.pdf");
});

test("a failed preview can be retried for the same file", async () => {
  let attempts = 0;
  const { previewGuestFile } = load("../lib/guest-api.ts", {
    FormData,
    fetch: async () => {
      attempts++;
      return { ok: attempts > 1, json: async () => attempts > 1 ? { success: true, data: { total_pages: 1 } } : { detail: "Pratinjau sedang sibuk." } };
    },
  });
  const file = new File(["pdf"], "source.pdf");
  assert.equal((await previewGuestFile(file)).success, false);
  assert.equal((await previewGuestFile(file)).data.total_pages, 1);
  assert.equal(attempts, 2);
});

test("an application-level preview failure is not cached as a successful preview", async () => {
  let attempts = 0;
  const { previewGuestFile } = load("../lib/guest-api.ts", {
    FormData,
    fetch: async () => ({ ok: true, json: async () => ++attempts === 1
      ? { success: false, data: null, error: "Pratinjau belum tersedia." }
      : { success: true, data: { total_pages: 1, thumbnails: [] } } }),
  });
  const file = new File(["pdf"], "source.pdf");
  assert.equal((await previewGuestFile(file)).error, "Pratinjau belum tersedia.");
  assert.equal((await previewGuestFile(file)).success, true);
  assert.equal(attempts, 2);
});
