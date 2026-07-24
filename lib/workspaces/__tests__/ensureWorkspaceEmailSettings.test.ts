import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ensureWorkspaceEmailSettings } from "../ensureWorkspaceEmailSettings";
import type { WorkspaceBootstrapAdmin } from "../ensureWorkspaceForUser";

type EmailSettingsRow = {
  workspace_id: string;
  from_name: string | null;
  from_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  use_tls: boolean | null;
};

function createMockAdmin(initialRows: EmailSettingsRow[] = []) {
  const rows = [...initialRows];

  const admin = {
    from(table: string) {
      if (table !== "workspace_email_settings") {
        throw new Error(`unexpected table ${table}`);
      }

      let pendingInsert: Record<string, unknown> | null = null;
      let workspaceFilter: string | null = null;

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          if (column === "workspace_id") {
            workspaceFilter = value;
          }
          return builder;
        },
        insert(row: Record<string, unknown>) {
          const workspaceId = String(row.workspace_id);
          const duplicate = rows.some((entry) => entry.workspace_id === workspaceId);
          if (duplicate) {
            return Promise.resolve({
              data: null,
              error: { message: "duplicate", code: "23505" },
            });
          }
          rows.push({
            workspace_id: workspaceId,
            from_name: (row.from_name as string | null | undefined) ?? null,
            from_email: (row.from_email as string | null | undefined) ?? null,
            smtp_host: (row.smtp_host as string | null | undefined) ?? null,
            smtp_port: (row.smtp_port as number | null | undefined) ?? null,
            smtp_username: (row.smtp_username as string | null | undefined) ?? null,
            smtp_password: (row.smtp_password as string | null | undefined) ?? null,
            use_tls: (row.use_tls as boolean | null | undefined) ?? null,
          });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: async () => {
          const row = rows.find((entry) => entry.workspace_id === workspaceFilter) ?? null;
          return { data: row, error: null };
        },
      };

      return builder;
    },
  };

  return { admin: admin as unknown as WorkspaceBootstrapAdmin, rows };
}

describe("ensureWorkspaceEmailSettings (R2G)", () => {
  it("A — creates a minimal row when missing", async () => {
    const { admin, rows } = createMockAdmin();
    const result = await ensureWorkspaceEmailSettings(admin, "ws-new-email");
    assert.deepEqual(result, { created: true, existing: false });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.workspace_id, "ws-new-email");
    assert.equal(rows[0]?.from_email, null);
    assert.equal(rows[0]?.smtp_host, null);
  });

  it("C/E — existing row is no-op", async () => {
    const existing: EmailSettingsRow = {
      workspace_id: "ws-existing-email",
      from_name: "Custom Co",
      from_email: "billing@custom.co",
      smtp_host: "smtp.custom.co",
      smtp_port: 465,
      smtp_username: "smtp-user",
      smtp_password: "secret",
      use_tls: true,
    };
    const { admin, rows } = createMockAdmin([existing]);
    const result = await ensureWorkspaceEmailSettings(admin, "ws-existing-email");
    assert.deepEqual(result, { created: false, existing: true });
    assert.deepEqual(rows[0], existing);
  });

  it("D — preserves customized SMTP row on re-run", async () => {
    const existing: EmailSettingsRow = {
      workspace_id: "ws-smtp",
      from_name: "SMTP Co",
      from_email: "noreply@smtp.co",
      smtp_host: "smtp.mail.test",
      smtp_port: 587,
      smtp_username: "user",
      smtp_password: "pass",
      use_tls: true,
    };
    const { admin, rows } = createMockAdmin([existing]);

    const first = await ensureWorkspaceEmailSettings(admin, "ws-smtp");
    const second = await ensureWorkspaceEmailSettings(admin, "ws-smtp");

    assert.deepEqual(first, { created: false, existing: true });
    assert.deepEqual(second, { created: false, existing: true });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], existing);
  });
});
