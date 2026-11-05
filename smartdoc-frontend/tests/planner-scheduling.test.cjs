const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");
const { schedulePlannerItem } = load("../lib/planner-scheduling.ts");
const task = { id: "task-1", kind: "task", title: "Review", description: "Keep notes", status: "doing", priority: "high", due_at: null, starts_at: null, ends_at: null, document_ids: ["document-1"], category_id: "category-1" };

test("scheduling a task sets a deadline without losing status or document links", () => {
  const result = schedulePlannerItem(task, "2026-11-02", "Asia/Jakarta");
  assert.equal(result.due_at, "2026-11-02T09:00");
  assert.equal(result.status, "doing");
  assert.equal(result.priority, "high");
  assert.equal(result.document_ids[0], "document-1");
  assert.equal(result.category_id, "category-1");
  assert.equal("id" in result, false);
  assert.equal(task.due_at, null);
});

test("moving a task retains account-local time rather than UTC or browser time", () => {
  const item = { ...task, due_at: "2026-10-29T17:30:00Z" };
  assert.equal(schedulePlannerItem(item, "2026-11-02", "Asia/Jakarta").due_at, "2026-11-02T00:30");
  assert.equal(schedulePlannerItem(item, "2026-11-02", "Asia/Jayapura").due_at, "2026-11-02T02:30");
});

test("moving an overnight event preserves its time and duration across a year boundary", () => {
  const event = { ...task, kind: "event", starts_at: "2026-10-29T16:30:00Z", ends_at: "2026-10-29T18:15:00Z" };
  const result = schedulePlannerItem(event, "2026-12-31", "Asia/Jakarta");
  assert.equal(result.starts_at, "2026-12-31T23:30");
  assert.equal(result.ends_at, "2027-01-01T01:15");
  assert.equal(result.category_id, "category-1");
  assert.equal(event.starts_at, "2026-10-29T16:30:00Z");
});
