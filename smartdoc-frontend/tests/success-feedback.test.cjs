const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const feedback = load("../lib/success-feedback.ts");

test("completed mutation requires an explicit completed HTTP status and success envelope", () => {
  for (const httpStatus of [200, 201, 204]) assert.equal(feedback.isCompletedResponse({ success: true, httpStatus }), true);
  for (const httpStatus of [undefined, 202, 400, 401, 403, 500, 503]) assert.equal(feedback.isCompletedResponse({ success: true, httpStatus }), false);
  assert.equal(feedback.isCompletedResponse({ success: false, httpStatus: 200 }), false);
  assert.match(feedback.mutationFailure({ success: true, httpStatus: 202 }), /masih diproses/);
});

test("job success requires a downloadable positive output, not polling success or progress", () => {
  const ready = { status: "done", output_size: 1234, download_available: true };
  assert.equal(feedback.isDownloadReady(ready), true);
  for (const change of [{ status: "pending", progress: 100 }, { status: "processing" }, { status: "failed" }, { output_size: 0 }, { output_size: null }, { output_size: Infinity }, { download_available: false }, { download_available: undefined }]) {
    assert.equal(feedback.isDownloadReady({ ...ready, ...change }), false);
  }
  assert.equal(feedback.isDownloadReady(null), false);
});

test("file success rejects accepted responses, empty output and JSON/HTML error payloads", () => {
  const binary = { size: 120, type: "application/pdf" };
  const response = (status, type) => ({ status, headers: new Headers({ "Content-Type": type }) });
  assert.equal(feedback.isCompletedFile(response(200, "application/pdf"), binary), true);
  assert.equal(feedback.isCompletedFile(response(200, "application/vnd.openxmlformats-officedocument.presentationml.presentation"), binary), true);
  for (const [status, type, size] of [[202, "application/pdf", 120], [200, "application/pdf", 0], [200, "application/json", 120], [200, "text/html; charset=utf-8", 120]]) {
    assert.equal(feedback.isCompletedFile(response(status, type), { ...binary, size }), false);
  }
});

test("API transport preserves accepted status, rejects malformed success and never trusts body status", async () => {
  for (const [status, body, success] of [[201, { success: true, data: { id: "created" }, httpStatus: 202 }, true], [202, { success: true, data: { job_id: "queued" }, httpStatus: 200 }, true], [200, {}, false], [200, null, false], [200, { success: "true" }, false], [200, { success: false, data: { id: "uncommitted" } }, false], [500, { success: true }, false], [204, null, true]]) {
    const client = load("../lib/api/client.ts", { require: () => ({ sessionFetch: async () => ({ status, ok: status < 400, json: async () => body }) }) });
    const response = await client.apiFetch("/synthetic", { method: "POST" });
    assert.equal(response.httpStatus, status);
    assert.equal(response.success, success);
    if (!success) assert.equal(response.data, null);
    assert.equal(feedback.isCompletedResponse(response), success && status !== 202);
  }
});

test("authenticated file transport rejects false successful downloads", async () => {
  for (const [status, type, size] of [[200, "application/json", 20], [202, "application/pdf", 20], [200, "application/pdf", 0]]) {
    const files = load("../lib/api/files.ts", { require: (name) => name.includes("success-feedback") ? feedback : ({ sessionFetch: async () => ({ ok: true, status, headers: new Headers({ "Content-Type": type }), blob: async () => ({ size, type }) }) }) });
    await assert.rejects(files.fetchFile("/synthetic/download"), /tidak valid/);
  }
});
