import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateEmailReadiness,
  loadEmailReadinessForWorkspace,
} from "../emailReadinessGate";

const RESEND_ENV = process.env.RESEND_API_KEY;

describe("evaluateEmailReadiness (R2G)", () => {
  it("G — missing email row fails closed", () => {
    const result = evaluateEmailReadiness({
      emailSettingsRow: null,
      emailProvider: "resend",
    });
    assert.equal(result.ready, false);
    if (result.ready) return;
    assert.equal(result.skipReason, "email_settings_missing");
  });

  it("F — minimal row is ready for platform Resend when configured", () => {
    process.env.RESEND_API_KEY = "test-key";
    const result = evaluateEmailReadiness({
      emailSettingsRow: { smtp_host: null, smtp_port: null },
      emailProvider: "resend",
    });
    assert.deepEqual(result, { ready: true });
    process.env.RESEND_API_KEY = RESEND_ENV;
  });

  it("minimal row fails closed when Resend is not configured", () => {
    delete process.env.RESEND_API_KEY;
    const result = evaluateEmailReadiness({
      emailSettingsRow: { smtp_host: null, smtp_port: null },
      emailProvider: "resend",
    });
    assert.equal(result.ready, false);
    if (result.ready) return;
    assert.equal(result.skipReason, "resend_not_configured");
    process.env.RESEND_API_KEY = RESEND_ENV;
  });

  it("minimal row is ready when email provider is unset and Resend configured", () => {
    process.env.RESEND_API_KEY = "test-key";
    const result = evaluateEmailReadiness({
      emailSettingsRow: { smtp_host: null, smtp_port: null },
      emailProvider: null,
    });
    assert.deepEqual(result, { ready: true });
    process.env.RESEND_API_KEY = RESEND_ENV;
  });

  it("I — SMTP selected with incomplete settings fails closed", () => {
    const result = evaluateEmailReadiness({
      emailSettingsRow: { smtp_host: null, smtp_port: null },
      emailProvider: "smtp",
    });
    assert.equal(result.ready, false);
    if (result.ready) return;
    assert.equal(result.skipReason, "smtp_configuration_incomplete");
  });

  it("accepts complete SMTP configuration", () => {
    const result = evaluateEmailReadiness({
      emailSettingsRow: { smtp_host: "smtp.example.com", smtp_port: 587 },
      emailProvider: "smtp",
    });
    assert.deepEqual(result, { ready: true });
  });
});

describe("loadEmailReadinessForWorkspace (R2G)", () => {
  it("returns email_settings_missing when row absent", async () => {
    const supabase = {
      from(table: string) {
        if (table === "settings") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({ data: { email_provider: "resend" }, error: null }),
          };
        }
        if (table === "workspace_email_settings") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const result = await loadEmailReadinessForWorkspace(supabase as never, "ws-1");
    assert.equal(result.ready, false);
    if (result.ready) return;
    assert.equal(result.skipReason, "email_settings_missing");
  });
});
