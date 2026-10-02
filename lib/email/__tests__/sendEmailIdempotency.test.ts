import assert from "node:assert/strict";
import Module from "node:module";
import { after, describe, it } from "node:test";
import "@/lib/test/nodeTestSetup";
import { sendEmail } from "../sendEmail";

type Runtime = typeof Module & { _load: (request: string, ...args: unknown[]) => unknown };
const runtime = Module as Runtime;
const originalLoad = runtime._load;
const originalEnv = { RESEND_API_KEY: process.env.RESEND_API_KEY, ARREXIA_EMAIL_FROM: process.env.ARREXIA_EMAIL_FROM };
process.env.RESEND_API_KEY = "fixture-only";
process.env.ARREXIA_EMAIL_FROM = "Arrexia <sender@example.invalid>";
const calls: Array<{ payload: Record<string, unknown>; options: unknown }> = [];
let response: unknown = { data: { id: "fixture-message" }, error: null };
class FixtureResend {
  emails = { send: async (payload: Record<string, unknown>, options: unknown) => {
    calls.push({ payload, options });
    if (response instanceof Error) throw response;
    return response;
  } };
}
runtime._load = function(request, ...args) { return request === "resend" ? { Resend: FixtureResend } : originalLoad.call(this, request, ...args); };
after(() => { runtime._load = originalLoad; for(const [key,value] of Object.entries(originalEnv)) { if(value === undefined) delete process.env[key]; else process.env[key] = value; } });
describe("Resend durable request transport", () => {
  it("passes stable provider idempotency and frozen From without rewriting the retry payload", async () => {
    response = { data: { id: "fixture-message" }, error: null };
    const result = await sendEmail({ to: "owner@example.invalid", subject: "Renewed", text: "A verified renewal", frozenFrom: "Arrexia <frozen@example.invalid>", idempotencyKey: "production:txn_one" });
    assert.equal(result.messageId, "fixture-message");
    assert.equal(calls.at(-1)?.payload.from, "Arrexia <frozen@example.invalid>");
    assert.deepEqual(calls.at(-1)?.options, { idempotencyKey: "production:txn_one" });
  });
  it("network ambiguity and server errors stay uncertain; explicit quota rejection does not", async () => {
    for (const [next, uncertain] of [[new Error("fixture network ambiguity"), true], [{ data: null, error: { statusCode: 500, message: "server error" } }, true], [{ data: null, error: { statusCode: 429, message: "quota exhausted" } }, false]] as const) {
      response = next;
      const result = await sendEmail({ to: "owner@example.invalid", subject: "Renewed", text: "Receipt", idempotencyKey: "production:txn_one" });
      assert.equal(result.success, false);
      assert.equal(Boolean(result.uncertain), uncertain);
    }
  });
  it("a missing provider message identity is uncertain even when the API returns no error", async () => {
    response = { data: null, error: null };
    const result = await sendEmail({ to: "owner@example.invalid", subject: "Renewed", text: "Receipt", idempotencyKey: "production:txn_one" });
    assert.equal(result.uncertain, true);
  });
});
