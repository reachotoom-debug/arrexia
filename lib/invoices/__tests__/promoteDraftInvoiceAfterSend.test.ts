import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  promoteDraftInvoiceToSentAfterSend,
  revalidatePathsAfterInvoiceSent,
  shouldPromoteDraftToSent,
} from "../promoteDraftInvoiceAfterSend";

function createMockSupabase(options: {
  error?: { message: string } | null;
  calls?: Array<{ table: string; values: unknown; filters: Record<string, string> }>;
}) {
  const calls: Array<{ table: string; values: unknown; filters: Record<string, string> }> =
    options.calls ?? [];

  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      return {
        update(values: { status: string }) {
          return {
            eq(column: string, value: string) {
              filters[column] = value;
              return {
                eq(nextColumn: string, nextValue: string) {
                  filters[nextColumn] = nextValue;
                  return {
                    async eq(finalColumn: string, finalValue: string) {
                      filters[finalColumn] = finalValue;
                      calls.push({ table, values, filters: { ...filters } });
                      return { error: options.error ?? null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    calls,
  };
}

describe("shouldPromoteDraftToSent", () => {
  it("returns true only for draft status", () => {
    assert.equal(shouldPromoteDraftToSent("draft"), true);
    assert.equal(shouldPromoteDraftToSent("Draft"), true);
    assert.equal(shouldPromoteDraftToSent("sent"), false);
    assert.equal(shouldPromoteDraftToSent("void"), false);
    assert.equal(shouldPromoteDraftToSent(null), false);
  });
});

describe("promoteDraftInvoiceToSentAfterSend", () => {
  it("A — successful send draft → sent", async () => {
    const calls: Array<{ table: string; values: unknown; filters: Record<string, string> }> =
      [];
    const supabase = createMockSupabase({ calls });

    const result = await promoteDraftInvoiceToSentAfterSend(
      supabase,
      "ws-1",
      "inv-1",
      "draft"
    );

    assert.deepEqual(result, { promoted: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.table, "invoices");
    assert.deepEqual(calls[0]?.values, { status: "sent" });
    assert.deepEqual(calls[0]?.filters, {
      id: "inv-1",
      workspace_id: "ws-1",
      status: "draft",
    });
  });

  it("B — failed send → remains draft (no update attempted)", async () => {
    const calls: Array<{ table: string; values: unknown; filters: Record<string, string> }> =
      [];
    const supabase = createMockSupabase({ calls });

    const result = await promoteDraftInvoiceToSentAfterSend(
      supabase,
      "ws-1",
      "inv-1",
      "sent"
    );

    assert.deepEqual(result, { promoted: false, reason: "not_draft" });
    assert.equal(calls.length, 0);
  });

  it("C — already-sent invoice stays sent", async () => {
    const calls: Array<{ table: string; values: unknown; filters: Record<string, string> }> =
      [];
    const supabase = createMockSupabase({ calls });

    const result = await promoteDraftInvoiceToSentAfterSend(
      supabase,
      "ws-1",
      "inv-1",
      "sent"
    );

    assert.deepEqual(result, { promoted: false, reason: "not_draft" });
    assert.equal(calls.length, 0);
  });

  it("D — workspace scoping preserved on update", async () => {
    const calls: Array<{ table: string; values: unknown; filters: Record<string, string> }> =
      [];
    const supabase = createMockSupabase({ calls });

    await promoteDraftInvoiceToSentAfterSend(supabase, "ws-target", "inv-1", "draft");

    assert.equal(calls[0]?.filters.workspace_id, "ws-target");
    assert.equal(calls[0]?.filters.id, "inv-1");
    assert.equal(calls[0]?.filters.status, "draft");
  });

  it("returns update_failed when database update fails", async () => {
    const supabase = createMockSupabase({
      error: { message: "permission denied" },
    });

    const result = await promoteDraftInvoiceToSentAfterSend(
      supabase,
      "ws-1",
      "inv-1",
      "draft"
    );

    assert.deepEqual(result, {
      promoted: false,
      reason: "update_failed",
      error: "permission denied",
    });
  });
});

describe("send-invoice-route integration contract", () => {
  it("promotes draft only after email success path", () => {
    const src = readFileSync("lib/invoices/send-invoice-route.ts", "utf8");
    const afterFailureGuard = src.slice(src.indexOf("if (!result.success)"));

    assert.match(afterFailureGuard, /promoteDraftInvoiceToSentAfterSend/);
    assert.match(src, /if \(!result\.success\)/);
    assert.match(src, /select\("id, workspace_id, client_id, invoice_number, status"\)/);
  });

  it("revalidates invoice, collections, actions, and dashboard after promotion", () => {
    const revalidated: string[] = [];
    revalidatePathsAfterInvoiceSent("ws-1", "inv-1", (path) => {
      revalidated.push(path);
    });

    assert.deepEqual(revalidated, [
      "/ws-1/invoices/inv-1",
      "/ws-1/invoices",
      "/ws-1/collections",
      "/ws-1/actions",
      "/ws-1/dashboard",
    ]);
  });
});
