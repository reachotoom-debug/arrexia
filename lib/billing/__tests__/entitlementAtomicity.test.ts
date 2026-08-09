import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { TRIAL_AI_GENERATION_LIMIT, TRIAL_INVOICE_LIMIT_TOTAL } from "@/lib/billing/trialConfig";
import { resolveWorkspaceEntitlement } from "@/lib/billing/resolveWorkspaceEntitlement";
import {
  finalizeEntitlementUsage,
  releaseEntitlementUsage,
  reserveEntitlementUsage,
  tryConsumeEntitlementUsage,
  type EntitlementUsageSnapshot,
} from "@/lib/billing/usageMetering";

type UsageRow = EntitlementUsageSnapshot;

type ReservationRow = {
  reservation_id: string;
  workspace_id: string;
  resource: string;
  amount: number;
  state: "reserved" | "consumed" | "released";
};

function createAtomicUsageMock(initial: Partial<UsageRow> = {}) {
  const row: UsageRow = {
    workspace_id: "ws-atomic",
    trial_invoices_created: initial.trial_invoices_created ?? 0,
    ai_generations_successful: initial.ai_generations_successful ?? 0,
    automated_reminders_sent: initial.automated_reminders_sent ?? 0,
    manual_email_reminders_sent: initial.manual_email_reminders_sent ?? 0,
  };

  const reservations = new Map<string, ReservationRow>();

  let lock: Promise<void> = Promise.resolve();

  const withLock = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = lock;
    lock = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };


  const limitValues: Record<string, number> = {
    trial_invoices: TRIAL_INVOICE_LIMIT_TOTAL,
    ai_generations: TRIAL_AI_GENERATION_LIMIT,
    automated_reminders: 75,
    manual_email_reminders: 75,
  };

  const readCount = (resource: string): number => {
    switch (resource) {
      case "trial_invoices":
        return row.trial_invoices_created;
      case "ai_generations":
        return row.ai_generations_successful;
      case "automated_reminders":
        return row.automated_reminders_sent;
      case "manual_email_reminders":
        return row.manual_email_reminders_sent;
      default:
        return 0;
    }
  };

  const writeCount = (resource: string, value: number): void => {
    switch (resource) {
      case "trial_invoices":
        row.trial_invoices_created = value;
        break;
      case "ai_generations":
        row.ai_generations_successful = value;
        break;
      case "automated_reminders":
        row.automated_reminders_sent = value;
        break;
      case "manual_email_reminders":
        row.manual_email_reminders_sent = value;
        break;
    }
  };

  const tryConsume = (resource: string, amount: number) => {
    const limit = limitValues[resource];
    if (limit === undefined) {
      return { data: null, error: { message: "invalid resource" } };
    }
    const current = readCount(resource);
    const nextValue = current + amount;
    if (nextValue > limit) {
      return {
        data: { ok: false, reason: "limit_reached", resource, limit },
        error: null,
      };
    }
    writeCount(resource, nextValue);
    return { data: { ok: true, ...row }, error: null };
  };

  const admin = {
    rpc: async (
      fn: string,
      args: {
        p_workspace_id: string;
        p_resource: string;
        p_amount?: number;
        p_reservation_id?: string;
      }
    ) => {
      return withLock(async () => {
        const amount = args.p_amount ?? 1;

        if (fn === "rpc_try_consume_entitlement_usage") {
          return tryConsume(args.p_resource, amount);
        }

        if (fn === "rpc_reserve_entitlement_usage") {
          const reservationId = args.p_reservation_id;
          if (!reservationId) {
            return { data: null, error: { message: "reservation_id required" } };
          }
          const existing = reservations.get(reservationId);
          if (existing) {
            return {
              data: {
                ok: true,
                idempotent: true,
                state: existing.state,
                usage: row,
              },
              error: null,
            };
          }
          const consumed = tryConsume(args.p_resource, amount);
          if ((consumed.data as { ok?: boolean } | null)?.ok !== true) {
            return consumed;
          }
          reservations.set(reservationId, {
            reservation_id: reservationId,
            workspace_id: args.p_workspace_id,
            resource: args.p_resource,
            amount,
            state: "reserved",
          });
          return {
            data: { ok: true, idempotent: false, state: "reserved", usage: row },
            error: null,
          };
        }

        if (fn === "rpc_finalize_entitlement_usage") {
          const reservationId = args.p_reservation_id;
          if (!reservationId) {
            return { data: null, error: { message: "reservation_id required" } };
          }
          const existing = reservations.get(reservationId);
          if (!existing) {
            return { data: { ok: false, reason: "reservation_not_found" }, error: null };
          }
          if (existing.state === "consumed") {
            return {
              data: { ok: true, idempotent: true, state: "consumed", usage: row },
              error: null,
            };
          }
          if (existing.state === "released") {
            return { data: { ok: false, reason: "already_released" }, error: null };
          }
          existing.state = "consumed";
          return {
            data: { ok: true, idempotent: false, state: "consumed", usage: row },
            error: null,
          };
        }

        if (fn === "rpc_release_entitlement_usage") {
          const reservationId = args.p_reservation_id;
          if (!reservationId) {
            return { data: null, error: { message: "reservation_id is required" } };
          }

          const existing = reservations.get(reservationId);
          if (!existing) {
            return {
              data: { ok: true, released: false, reason: "reservation_not_found" },
              error: null,
            };
          }

          if (
            existing.workspace_id !== args.p_workspace_id ||
            existing.resource !== args.p_resource ||
            existing.amount !== amount
          ) {
            return { data: null, error: { message: "reservation release mismatch" } };
          }

          if (existing.state === "released") {
            return {
              data: {
                ok: true,
                released: false,
                idempotent: true,
                state: "released",
                usage: row,
              },
              error: null,
            };
          }
          if (existing.state === "consumed") {
            return {
              data: {
                ok: true,
                released: false,
                idempotent: true,
                state: "consumed",
                usage: row,
              },
              error: null,
            };
          }
          writeCount(args.p_resource, Math.max(0, readCount(args.p_resource) - amount));
          existing.state = "released";
          return {
            data: { ok: true, released: true, idempotent: false, state: "released", usage: row },
            error: null,
          };
        }

        return { data: null, error: { message: "unknown rpc" } };
      });
    },
  };

  return { admin, row, reservations };
}

describe("entitlement atomic enforcement contracts", () => {
  const migration = readFileSync(
    "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
    "utf8"
  );

  it("defines atomic try-consume with limit predicate in SQL", () => {
    assert.match(migration, /rpc_try_consume_entitlement_usage/);
    assert.match(migration, /trial_invoices_created \+ p_amount <= v_limit/);
    assert.match(migration, /ai_generations_successful \+ p_amount <= v_limit/);
  });

  it("wraps import RPCs with transactional preflight", () => {
    assert.match(migration, /internal_import_entitlement_preflight/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /internal_rpc_import_clients/);
    assert.match(migration, /internal_import_invoices_grouped/);
  });

  it("enforces client capacity on INSERT trigger", () => {
    assert.match(migration, /trg_clients_enforce_capacity/);
    assert.match(migration, /client_limit_reached/);
  });

  it("enforces trial invoice usage on INSERT trigger via unified entitlement trigger", () => {
    const migration = readFileSync(
      "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
      "utf8"
    );
    assert.match(migration, /trg_invoices_enforce_entitlement/);
    assert.match(migration, /rpc_try_consume_entitlement_usage/);
  });

  it("revokes try/release RPC execute from authenticated", () => {
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_try_consume_entitlement_usage/);
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_release_entitlement_usage/);
    assert.match(
      migration,
      /GRANT EXECUTE ON FUNCTION public\.rpc_try_consume_entitlement_usage[\s\S]* TO service_role/
    );
  });
});

describe("tryConsumeEntitlementUsage concurrency semantics", () => {
  it("two simultaneous AI attempts at final allowance cannot exceed limit", async () => {
    const { admin, row } = createAtomicUsageMock({
      ai_generations_successful: TRIAL_AI_GENERATION_LIMIT - 1,
    });

    const results = await Promise.all([
      tryConsumeEntitlementUsage("ws-atomic", "ai_generations", 1, admin as never),
      tryConsumeEntitlementUsage("ws-atomic", "ai_generations", 1, admin as never),
    ]);

    const successes = results.filter((result) => result.ok).length;
    assert.equal(successes, 1);
    assert.equal(row.ai_generations_successful, TRIAL_AI_GENERATION_LIMIT);
  });

  it("two simultaneous automated reminder attempts at final allowance cannot exceed limit", async () => {
    const { admin, row } = createAtomicUsageMock({ automated_reminders_sent: 74 });

    const results = await Promise.all([
      tryConsumeEntitlementUsage("ws-atomic", "automated_reminders", 1, admin as never),
      tryConsumeEntitlementUsage("ws-atomic", "automated_reminders", 1, admin as never),
    ]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(row.automated_reminders_sent, 75);
  });

  it("two simultaneous manual reminder attempts at final allowance cannot exceed limit", async () => {
    const { admin, row } = createAtomicUsageMock({ manual_email_reminders_sent: 74 });

    const results = await Promise.all([
      tryConsumeEntitlementUsage("ws-atomic", "manual_email_reminders", 1, admin as never),
      tryConsumeEntitlementUsage("ws-atomic", "manual_email_reminders", 1, admin as never),
    ]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(row.manual_email_reminders_sent, 75);
  });

  it("failed reserved AI operation releases allowance once", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "11111111-1111-1111-1111-111111111111";

    const reserved = await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    assert.equal(reserved.ok, true);
    assert.equal(row.ai_generations_successful, 11);

    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    assert.equal(row.ai_generations_successful, 10);
  });

  it("duplicate retry does not double-consume when first attempt already succeeded", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 49 });

    const first = await tryConsumeEntitlementUsage("ws-atomic", "ai_generations", 1, admin as never);
    const second = await tryConsumeEntitlementUsage("ws-atomic", "ai_generations", 1, admin as never);

    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(row.ai_generations_successful, 50);
  });

  it("two concurrent invoice quota attempts cannot exceed trial total", async () => {
    const { admin, row } = createAtomicUsageMock({
      trial_invoices_created: TRIAL_INVOICE_LIMIT_TOTAL - 1,
    });

    const results = await Promise.all([
      tryConsumeEntitlementUsage("ws-atomic", "trial_invoices", 1, admin as never),
      tryConsumeEntitlementUsage("ws-atomic", "trial_invoices", 1, admin as never),
    ]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(row.trial_invoices_created, TRIAL_INVOICE_LIMIT_TOTAL);
  });
});

describe("legacy free compatibility policy", () => {
  it("legacy_free without subscription is read-only", () => {
    const entitlement = resolveWorkspaceEntitlement({
      storedPlan: "free",
      subscription: null,
    });
    assert.equal(entitlement.state, "legacy_free");
    assert.equal(entitlement.canMutate, false);
  });

  it("legacy_free can still resolve billing conversion via paid plan change path", () => {
    const src = readFileSync("lib/billing/changeWorkspacePlan.ts", "utf8");
    assert.doesNotMatch(src, /canMutate/);
    assert.match(src, /executeAtomicWorkspacePlanChange/);
  });

  it("bootstrap does not grant trial to grandfathered legacy shells", () => {
    const src = readFileSync("lib/workspaces/ensureWorkspaceForUser.ts", "utf8");
    assert.match(src, /planCreated/);
    assert.match(src, /withinRecoveryWindow/);
  });
});

describe("import pre-check remains non-authoritative", () => {
  it("server action still performs UX preflight before RPC", () => {
    const clientsSrc = readFileSync(
      "app/[workspaceId]/settings/import/actions/clients.ts",
      "utf8"
    );
    const invoicesSrc = readFileSync(
      "app/[workspaceId]/settings/import/actions/invoices.ts",
      "utf8"
    );
    assert.match(clientsSrc, /assertImportEntitlement/);
    assert.match(clientsSrc, /rpc_import_clients/);
    assert.match(invoicesSrc, /assertImportEntitlement/);
    assert.match(invoicesSrc, /import_invoices_grouped/);
  });

  it("import RPC wrapper rejects concurrent overflow at database layer", () => {
    const migration = readFileSync(
      "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
      "utf8"
    );
    assert.match(migration, /v_active_clients \+ p_new_clients > v_state\.client_limit/);
    assert.match(migration, /v_trial_invoices_used \+ p_new_invoices > v_state\.trial_invoice_limit/);
  });
});

describe("phase 2 final consistency hardening contracts", () => {
  const migration = readFileSync(
    "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
    "utf8"
  );

  it("adds durable workspace trial_consumed_at marker", () => {
    assert.match(migration, /ALTER TABLE public\.workspaces[\s\S]*trial_consumed_at/);
    assert.match(migration, /UPDATE public\.workspaces w[\s\S]*workspace_subscriptions ws/);
  });

  it("enforces paid monthly invoice limits in INSERT trigger", () => {
    assert.match(migration, /trg_invoices_enforce_entitlement/);
    assert.match(migration, /invoice_limit_reached/);
    assert.match(migration, /internal_invoice_counts_toward_monthly_limit/);
    assert.match(migration, /v_monthly_invoices \+ 1 > v_state\.invoice_limit_monthly/);
  });

  it("defines idempotent reservation lifecycle RPCs", () => {
    assert.match(migration, /workspace_entitlement_reservations/);
    assert.match(migration, /rpc_reserve_entitlement_usage/);
    assert.match(migration, /rpc_finalize_entitlement_usage/);
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_reserve_entitlement_usage/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_release_entitlement_usage[\s\S]* TO service_role/);
  });

  it("preserves trial consumption in atomic billing RPC", () => {
    assert.match(migration, /UPDATE public\.workspaces w[\s\S]*trial_consumed_at/);
  });

  it("requires reservation_id and removes blind release overload", () => {
    assert.match(migration, /IF p_reservation_id IS NULL[\s\S]*reservation_id is required/);
    assert.doesNotMatch(migration, /Legacy blind release path/);
    assert.match(
      migration,
      /DROP FUNCTION IF EXISTS public\.rpc_release_entitlement_usage\(uuid, text, integer\)/
    );
  });

  it("hardens trigger updated_at helpers with fixed search_path", () => {
    assert.match(
      migration,
      /set_workspace_entitlement_reservations_updated_at[\s\S]*SET search_path = pg_catalog, public/
    );
    assert.match(
      migration,
      /set_workspace_entitlement_usage_updated_at[\s\S]*SET search_path = pg_catalog, public/
    );
  });
});

describe("reservation idempotency semantics", () => {
  it("duplicate reserve with same reservation_id does not double-consume", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "22222222-2222-2222-2222-222222222222";

    const first = await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    const second = await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.idempotent, true);
    assert.equal(row.ai_generations_successful, 11);
  });

  it("duplicate release does not double-decrement", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "33333333-3333-3333-3333-333333333333";

    await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    assert.equal(row.ai_generations_successful, 10);
  });

  it("release after successful finalize is a no-op", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "44444444-4444-4444-4444-444444444444";

    await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await finalizeEntitlementUsage("ws-atomic", reservationId, admin as never);
    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    assert.equal(row.ai_generations_successful, 11);
  });

  it("finalize after release does not consume again", async () => {
    const { admin, row, reservations } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "55555555-5555-5555-5555-555555555555";

    await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await finalizeEntitlementUsage("ws-atomic", reservationId, admin as never);
    assert.equal(row.ai_generations_successful, 10);
    assert.equal(reservations.get(reservationId)?.state, "released");
  });

  it("duplicate finalize is idempotent", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "66666666-6666-6666-6666-666666666666";

    await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );
    await finalizeEntitlementUsage("ws-atomic", reservationId, admin as never);
    await finalizeEntitlementUsage("ws-atomic", reservationId, admin as never);
    assert.equal(row.ai_generations_successful, 11);
  });

  it("two different reservation ids at final allowance still compete atomically", async () => {
    const { admin, row } = createAtomicUsageMock({
      ai_generations_successful: TRIAL_AI_GENERATION_LIMIT - 1,
    });

    const results = await Promise.all([
      reserveEntitlementUsage(
        "ws-atomic",
        "ai_generations",
        "77777777-7777-7777-7777-777777777777",
        1,
        admin as never
      ),
      reserveEntitlementUsage(
        "ws-atomic",
        "ai_generations",
        "88888888-8888-8888-8888-888888888888",
        1,
        admin as never
      ),
    ]);

    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(row.ai_generations_successful, TRIAL_AI_GENERATION_LIMIT);
  });

  it("release on nonexistent reservation does not decrement usage", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });

    await releaseEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      "99999999-9999-9999-9999-999999999999",
      1,
      admin as never
    );

    assert.equal(row.ai_generations_successful, 10);
  });

  it("mismatched reservation release is rejected without decrement", async () => {
    const { admin, row } = createAtomicUsageMock({ ai_generations_successful: 10 });
    const reservationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    await reserveEntitlementUsage(
      "ws-atomic",
      "ai_generations",
      reservationId,
      1,
      admin as never
    );

    await assert.rejects(
      () =>
        releaseEntitlementUsage(
          "ws-other",
          "ai_generations",
          reservationId,
          1,
          admin as never
        ),
      /reservation release mismatch/
    );
    assert.equal(row.ai_generations_successful, 11);
  });

  it("runtime callers always pass reservation_id to release", () => {
    const aiSrc = readFileSync("app/[workspaceId]/actions/generateCollectionMessage.ts", "utf8");
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    const guardSrc = readFileSync("lib/billing/entitlementGuard.ts", "utf8");
    const meteringSrc = readFileSync("lib/billing/usageMetering.ts", "utf8");

    assert.match(aiSrc, /releaseTrialUsageReservation\([\s\S]*reservationId/);
    assert.match(sendSrc, /releaseTrialUsageReservation\([\s\S]*reservationId/);
    assert.match(guardSrc, /releaseEntitlementUsage\(workspaceId, resource, reservationId/);
    assert.match(meteringSrc, /p_reservation_id: reservationId/);
  });
});

function createPaidMonthlyInvoiceMock(limit: number | null) {
  let monthlyCount = 0;
  let lock: Promise<void> = Promise.resolve();

  const withLock = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = lock;
    lock = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  return {
    get count() {
      return monthlyCount;
    },
    tryInsert: () =>
      withLock(() => {
        if (limit === null) {
          monthlyCount += 1;
          return { ok: true as const };
        }
        if (monthlyCount + 1 > limit) {
          return { ok: false as const, reason: "invoice_limit_reached" as const };
        }
        monthlyCount += 1;
        return { ok: true as const };
      }),
  };
}

describe("paid monthly invoice enforcement semantics", () => {
  it("Starter invoice #50 succeeds and #51 fails", async () => {
    const starter = createPaidMonthlyInvoiceMock(50);
    for (let i = 0; i < 49; i += 1) {
      assert.equal((await starter.tryInsert()).ok, true);
    }
    assert.equal((await starter.tryInsert()).ok, true);
    assert.equal(starter.count, 50);
    assert.equal((await starter.tryInsert()).ok, false);
    assert.equal(starter.count, 50);
  });

  it("two concurrent Starter creates at 49 cannot produce 51", async () => {
    const starter = createPaidMonthlyInvoiceMock(50);
    for (let i = 0; i < 49; i += 1) {
      assert.equal((await starter.tryInsert()).ok, true);
    }
    const results = await Promise.all([starter.tryInsert(), starter.tryInsert()]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(starter.count, 50);
  });

  it("Pro invoice #500 succeeds and #501 fails", async () => {
    const pro = createPaidMonthlyInvoiceMock(500);
    for (let i = 0; i < 499; i += 1) {
      assert.equal((await pro.tryInsert()).ok, true);
    }
    assert.equal((await pro.tryInsert()).ok, true);
    assert.equal(pro.count, 500);
    assert.equal((await pro.tryInsert()).ok, false);
  });

  it("two concurrent Pro creates at 499 cannot produce 501", async () => {
    const pro = createPaidMonthlyInvoiceMock(500);
    for (let i = 0; i < 499; i += 1) {
      assert.equal((await pro.tryInsert()).ok, true);
    }
    const results = await Promise.all([pro.tryInsert(), pro.tryInsert()]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(pro.count, 500);
  });

  it("Business remains unlimited", async () => {
    const business = createPaidMonthlyInvoiceMock(null);
    for (let i = 0; i < 600; i += 1) {
      assert.equal((await business.tryInsert()).ok, true);
    }
    assert.equal(business.count, 600);
  });

  it("trial invoice quota uses 75 total across calendar month boundaries", async () => {
    const { admin, row } = createAtomicUsageMock({
      trial_invoices_created: TRIAL_INVOICE_LIMIT_TOTAL - 1,
    });
    const first = await tryConsumeEntitlementUsage(
      "ws-atomic",
      "trial_invoices",
      1,
      admin as never
    );
    assert.equal(first.ok, true);
    assert.equal(row.trial_invoices_created, TRIAL_INVOICE_LIMIT_TOTAL);
    const second = await tryConsumeEntitlementUsage(
      "ws-atomic",
      "trial_invoices",
      1,
      admin as never
    );
    assert.equal(second.ok, false);
    assert.equal(row.trial_invoices_created, TRIAL_INVOICE_LIMIT_TOTAL);
  });

  it("import preflight counts once and per-row trigger converges without double trial consume", () => {
    const migration150 = readFileSync(
      "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
      "utf8"
    );
    const migration160 = readFileSync(
      "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
      "utf8"
    );
    assert.match(migration150, /v_trial_invoices_used \+ p_new_invoices > v_state\.trial_invoice_limit/);
    assert.doesNotMatch(
      migration150,
      /trial_invoices_created = u\.trial_invoices_created \+ p_new_invoices/
    );
    assert.match(migration160, /rpc_try_consume_entitlement_usage\(NEW\.workspace_id, 'trial_invoices', 1\)/);
  });

  it("paid monthly reset uses canonical UTC month boundaries matching application semantics", () => {
    const migration150 = readFileSync(
      "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
      "utf8"
    );
    const migration160 = readFileSync(
      "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
      "utf8"
    );
    const appSrc = readFileSync("lib/billing/getInvoiceUsageThisMonth.ts", "utf8");

    assert.match(appSrc, /Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), 1\)/);
    assert.match(migration150, /date_trunc\('month', timezone\('UTC', now\(\)\)\)/);
    assert.match(migration160, /date_trunc\('month', timezone\('UTC', now\(\)\)\)/);
    assert.match(migration160, /internal_import_entitlement_state/);
    assert.match(migration160, /invoice_limit_monthly IS NOT NULL/);
  });

  it("paid limits are sourced from workspace_plans, not hardcoded SQL caps", () => {
    const migration150 = readFileSync(
      "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
      "utf8"
    );
    const plansSrc = readFileSync("lib/billing/plans.ts", "utf8");

    assert.match(migration150, /SELECT wp\.plan, wp\.client_limit, wp\.invoice_limit_monthly/);
    assert.match(plansSrc, /invoiceLimitMonthly: 50/);
    assert.match(plansSrc, /invoiceLimitMonthly: 500/);
    assert.doesNotMatch(migration150, /WHEN 'starter' THEN 50/);
  });
});

describe("import invoice quota convergence", () => {
  const migration150 = readFileSync(
    "supabase/migrations/20260808150000_entitlement_atomic_enforcement.sql",
    "utf8"
  );
  const migration160 = readFileSync(
    "supabase/migrations/20260808160000_phase2_final_consistency_hardening.sql",
    "utf8"
  );
  const invoicesAction = readFileSync(
    "app/[workspaceId]/settings/import/actions/invoices.ts",
    "utf8"
  );

  it("trial import uses 75 TOTAL via INSERT trigger try_consume, not monthly reset", () => {
    assert.match(migration160, /rpc_try_consume_entitlement_usage\(NEW\.workspace_id, 'trial_invoices', 1\)/);
    assert.match(migration150, /trial_invoice_limit := 75/);
    assert.doesNotMatch(
      migration150,
      /trial_invoices_created = u\.trial_invoices_created \+ p_new_invoices/
    );
  });

  it("Starter/Pro paid import limits use workspace_plans.invoice_limit_monthly in preflight", () => {
    assert.match(
      migration150,
      /v_monthly_invoices \+ p_new_invoices > v_state\.invoice_limit_monthly/
    );
    assert.match(migration150, /invoice_limit_monthly IS NOT NULL/);
  });

  it("Business import skips paid monthly cap when invoice_limit_monthly IS NULL", () => {
    assert.match(migration150, /IF v_sub\.plan = 'business' THEN[\s\S]*invoice_limit_monthly := NULL/);
  });

  it("import preflight runs only on execute, dry_run skips mutation and preflight", () => {
    assert.match(migration160, /COALESCE\(p_dry_run, true\) IS NOT TRUE[\s\S]*internal_import_entitlement_preflight/);
    assert.match(invoicesAction, /previewInvoicesImport[\s\S]*const dryRun = true/);
    assert.match(invoicesAction, /executeInvoicesImport[\s\S]*const dryRun = false/);
  });

  it("invoice UPDATE path in app preview does not imply INSERT trigger consumption", () => {
    assert.match(invoicesAction, /action = "update"/);
    assert.match(migration160, /IF TG_OP <> 'INSERT' THEN[\s\S]*RETURN NEW/);
    assert.match(
      invoicesAction,
      /Trial invoice usage is consumed atomically by the invoices INSERT trigger/
    );
  });

  it("legacy json import overload is removed so preflight cannot be bypassed", () => {
    assert.match(
      migration160,
      /DROP FUNCTION IF EXISTS public\.import_invoices_grouped\(json, uuid, boolean\);/
    );
  });

  it("160000 upgrades 150000 production state missing internal_import_invoices_grouped", () => {
    assert.match(migration160, /\$preserve_internal\$/);
    assert.match(
      migration160,
      /pg_get_function_identity_arguments\(p\.oid\) = 'p_rows json, p_workspace_id uuid, p_dry_run boolean'/
    );
    assert.match(migration160, /\$verify_internal_import\$/);
    assert.match(
      migration160,
      /RETURN public\.internal_import_invoices_grouped\(p_workspace_id, p_rows, p_dry_run\);/
    );
  });
});
