import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_DUPLICATE_MESSAGE,
  WHATSAPP_DUPLICATE_MESSAGE,
  mapClientPersistenceError,
} from "@/lib/clients/clientPersistenceErrors";
import { clientFieldErrorResult } from "@/lib/clients/clientActionResult";

describe("client persistence error mapping", () => {
  it("A — WhatsApp unique collision maps to friendly field error", () => {
    const mapped = mapClientPersistenceError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "clients_workspace_whatsapp_phone_unique"',
      details: "Key (workspace_id, whatsapp_phone)=(22848fed-905b-43cf-ae7f-cf199d8929b2, +962779610078) already exists.",
    });

    assert.equal(mapped.kind, "fieldErrors");
    if (mapped.kind === "fieldErrors") {
      assert.equal(mapped.fieldErrors.whatsapp, WHATSAPP_DUPLICATE_MESSAGE);
      assert.equal(mapped.fieldErrors.email, undefined);
    }
  });

  it("B — raw PostgreSQL constraint text never reaches user via field error result", () => {
    const pgMessage =
      'duplicate key value violates unique constraint "clients_workspace_whatsapp_phone_unique"';
    const mapped = mapClientPersistenceError({ code: "23505", message: pgMessage });
    assert.equal(mapped.kind, "fieldErrors");

    const result = clientFieldErrorResult(
      mapped.kind === "fieldErrors" ? mapped.fieldErrors : {}
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.fieldErrors?.whatsapp, WHATSAPP_DUPLICATE_MESSAGE);
      assert.notEqual(result.message, pgMessage);
      assert.doesNotMatch(String(result.fieldErrors?.whatsapp), /clients_workspace_whatsapp_phone_unique/);
      assert.doesNotMatch(String(result.fieldErrors?.whatsapp), /duplicate key value violates/);
    }
  });

  it("preserves duplicate email behavior", () => {
    const mapped = mapClientPersistenceError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "clients_workspace_email_unique"',
    });

    assert.equal(mapped.kind, "fieldErrors");
    if (mapped.kind === "fieldErrors") {
      assert.equal(mapped.fieldErrors.email, EMAIL_DUPLICATE_MESSAGE);
    }
  });

  it("does not map unrelated database errors to WhatsApp field error", () => {
    const mapped = mapClientPersistenceError({
      code: "23503",
      message: 'insert or update on table "clients" violates foreign key constraint',
    });

    assert.equal(mapped.kind, "generic");
    if (mapped.kind === "generic") {
      assert.match(mapped.message, /foreign key constraint/);
    }
  });

  it("E — unique WhatsApp update success path is not blocked by mapper", () => {
    const mapped = mapClientPersistenceError({ code: undefined, message: undefined });
    assert.equal(mapped.kind, "generic");
  });
});
