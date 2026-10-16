import "@/lib/test/nodeTestSetup";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { test } from "node:test";
type Load = (request: string, parent?: NodeModule | null, isMain?: boolean) => unknown;
const runtime = Module as typeof Module & { _load: Load };
const originalLoad = runtime._load;
const ranges: number[] = [];
let sent = 0;
const db = { from(table: string) {
  assert.equal(table, "workspaces", "must complete workspace discovery before any send");
  return { select() { return this; }, order() { return this; }, range(from: number) {
    ranges.push(from);
    return Promise.resolve(from === 0 ? { data: Array.from({ length: 500 }, (_, i) => ({ id: `ws-${i}` })), error: null } : { data: null, error: { message: "second page failed" } });
  } };
} };
runtime._load = function(request, ...args) {
  if (request === "@/lib/supabase/admin") return { supabaseAdmin: () => db };
  if (request === "./send") return { sendReminderForInvoice: async () => { sent++; } };
  return originalLoad.call(this, request, ...args);
};
const { runDueRemindersForAllWorkspaces } = createRequire(__filename)("../run-reminders");
runtime._load = originalLoad;
test("later workspace discovery failure aborts the run before delivery", async () => {
  const result = await runDueRemindersForAllWorkspaces();
  assert.deepEqual(ranges, [0, 500]);
  assert.equal(sent, 0);
  assert.equal(result.workspaceResults.length, 0);
  assert.match(result.errors[0].error, /second page failed/);
  assert.equal(result.totalRemindersUncertain, 0);
});
