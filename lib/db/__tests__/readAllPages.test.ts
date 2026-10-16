import assert from "node:assert/strict";
import { it } from "node:test";
import { readAllPages } from "../readAllPages";

it("reads financial rows and successful history beyond 1000 without losing the last row", async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id, status: "sent" }));
  const result = await readAllPages(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
  assert.deepEqual(result.data, rows);
});
it("rejects later-page errors rather than returning a partial financial total", async () => {
  await assert.rejects(readAllPages(async (from) => from === 0
    ? { data: Array(500).fill({ id: 1 }), error: null }
    : { data: null, error: new Error("later page failed") }), /later page failed/);
});
it("rejects unavailable data", async () => {
  await assert.rejects(readAllPages(async () => ({ data: null, error: null })), /Incomplete/);
});
