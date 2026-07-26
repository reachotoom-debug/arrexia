import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  resolveClientFormPaymentTerms,
  resolveClientFormStatus,
  resolveClientPaymentTermsPersistence,
} from "../paymentTermsPersistence";
import { resolvePaymentTermsDays } from "../../invoices/paymentTerms";

describe("resolveClientPaymentTermsPersistence", () => {
  it("A — Net 30 client → invoice derives 30 days", () => {
    const fields = resolveClientPaymentTermsPersistence("30");
    assert.deepEqual(fields, { payment_terms: 30, payment_terms_days: 30 });

    const effectiveDays = resolvePaymentTermsDays(
      "net_30",
      null,
      fields.payment_terms_days,
      null
    );
    assert.equal(effectiveDays, 30);
  });

  it("B — Due on receipt → 0 days", () => {
    const fields = resolveClientPaymentTermsPersistence("0");
    assert.deepEqual(fields, { payment_terms: 0, payment_terms_days: 0 });

    const effectiveDays = resolvePaymentTermsDays(
      "due_on_receipt",
      null,
      fields.payment_terms_days,
      null
    );
    assert.equal(effectiveDays, 0);
  });

  it("C — Custom terms preserved when submitted as numeric days", () => {
    const fields = resolveClientPaymentTermsPersistence("45");
    assert.deepEqual(fields, { payment_terms: 45, payment_terms_days: 45 });

    const effectiveDays = resolvePaymentTermsDays(
      "custom",
      45,
      fields.payment_terms_days,
      null
    );
    assert.equal(effectiveDays, 45);
  });

  it("D — Existing fallback behavior remains safe for custom/empty", () => {
    assert.deepEqual(resolveClientPaymentTermsPersistence("custom"), {
      payment_terms: 30,
      payment_terms_days: 30,
    });
    assert.deepEqual(resolveClientPaymentTermsPersistence(""), {
      payment_terms: 30,
      payment_terms_days: 30,
    });
  });
});

describe("resolveClientFormStatus", () => {
  it("A — inactive client opens edit as inactive", () => {
    assert.equal(
      resolveClientFormStatus({ archived_at: null, is_active: false }),
      "inactive"
    );
  });

  it("B — saving name/email does not reactivate when form status is inactive", () => {
    const editSrc = readFileSync(
      "app/[workspaceId]/clients/[clientId]/edit/page.tsx",
      "utf8"
    );
    const actionsSrc = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");

    assert.match(editSrc, /resolveClientFormStatus\(client\)/);
    assert.match(actionsSrc, /is_active: parsed\.status === "active"/);
  });

  it("C — active remains active", () => {
    assert.equal(
      resolveClientFormStatus({ archived_at: null, is_active: true }),
      "active"
    );
  });

  it("D — archived behavior unchanged", () => {
    assert.equal(
      resolveClientFormStatus({
        archived_at: "2026-01-01T00:00:00.000Z",
        is_active: true,
      }),
      "inactive"
    );
  });
});

describe("resolveClientFormPaymentTerms", () => {
  it("prefers payment_terms_days over legacy payment_terms", () => {
    assert.equal(
      resolveClientFormPaymentTerms({
        payment_terms: "30",
        payment_terms_days: 45,
      }),
      "45"
    );
  });
});

describe("client actions persistence contract", () => {
  it("writes both payment_terms and payment_terms_days on create/update", () => {
    const src = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");
    assert.match(src, /resolveClientPaymentTermsPersistence/);
    assert.match(src, /payment_terms_days/);
  });
});

describe("client edit page contract", () => {
  it("derives form status from is_active and archived_at", () => {
    const src = readFileSync(
      "app/[workspaceId]/clients/[clientId]/edit/page.tsx",
      "utf8"
    );
    assert.match(src, /resolveClientFormStatus\(client\)/);
    assert.doesNotMatch(src, /client\.status === "archived"/);
  });
});
