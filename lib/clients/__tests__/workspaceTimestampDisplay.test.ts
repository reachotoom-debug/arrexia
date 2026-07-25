import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  APPLICATION_FALLBACK_TIMEZONE,
  EMPTY_TIMESTAMP_PLACEHOLDER,
  formatWorkspaceDisplayDate,
  instantToWorkspaceCalendarDate,
} from "@/lib/datetime/formatDateTime";

const R2O_INSTANT = "2026-07-24T22:30:00.000Z";

describe("R2O — workspace timestamp display (clients + settings)", () => {
  it("A — created_at instant displays Jul 25, 2026 in Asia/Amman", () => {
    assert.match(formatWorkspaceDisplayDate(R2O_INSTANT, "Asia/Amman"), /Jul 25, 2026/);
    assert.equal(instantToWorkspaceCalendarDate(R2O_INSTANT, "Asia/Amman"), "2026-07-25");
  });

  it("B — same instant displays Jul 24, 2026 in America/New_York", () => {
    assert.match(formatWorkspaceDisplayDate(R2O_INSTANT, "America/New_York"), /Jul 24, 2026/);
    assert.equal(instantToWorkspaceCalendarDate(R2O_INSTANT, "America/New_York"), "2026-07-24");
  });

  it("C — workspace display is stable regardless of process timezone", () => {
    const amman = formatWorkspaceDisplayDate(R2O_INSTANT, "Asia/Amman");
    const ny = formatWorkspaceDisplayDate(R2O_INSTANT, "America/New_York");
    assert.notEqual(amman, ny);
    assert.match(amman, /Jul 25, 2026/);
    assert.match(ny, /Jul 24, 2026/);
  });

  it("D — client export route uses workspace-aware timestamp formatting", () => {
    const src = readFileSync("app/api/export/clients/route.ts", "utf8");
    assert.match(src, /loadWorkspaceTimeZone/);
    assert.match(src, /instantToWorkspaceCalendarDate/);
    assert.doesNotMatch(src, /formatDate\(client\.created_at\)/);
  });

  it("D2 — live clients list views do not use browser-local created_at formatting", () => {
    for (const file of [
      "app/[workspaceId]/clients/_components/ClientsListView.tsx",
      "app/[workspaceId]/clients/_components/ClientsCardView.tsx",
      "app/[workspaceId]/clients/_components/ClientsTable.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /created_at.*toLocaleDateString|toLocaleDateString.*created_at/);
      assert.doesNotMatch(src, /getDate\(\).*created_at|created_at.*getDate\(\)/);
    }
  });

  it("E — ReminderTemplatesTable uses workspace-aware updated_at formatter", () => {
    const table = readFileSync(
      "app/[workspaceId]/settings/_components/ReminderTemplatesTable.tsx",
      "utf8"
    );
    assert.match(table, /formatWorkspaceDisplayDate/);
    assert.match(table, /workspaceTimeZone/);
    assert.doesNotMatch(table, /getDate\(\)|getMonth\(\)|getFullYear\(\)/);

    const section = readFileSync(
      "app/[workspaceId]/settings/_components/RemindersSettingsSection.tsx",
      "utf8"
    );
    assert.match(section, /loadWorkspaceTimeZone/);
  });

  it("H — AdminDateTimeCell behavior remains unchanged", () => {
    const src = readFileSync("components/admin/AdminDateTimeCell.tsx", "utf8");
    assert.match(src, /resolveAdminDisplayTimeZone/);
    assert.match(src, /formatAdminDisplayDateTime/);
    assert.doesNotMatch(src, /formatWorkspaceDisplayDateTime|formatWorkspaceDisplayDate/);
  });

  it("I — null timestamps fail safely", () => {
    assert.equal(formatWorkspaceDisplayDate(null, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
    assert.equal(formatWorkspaceDisplayDate(undefined, "Asia/Amman"), EMPTY_TIMESTAMP_PLACEHOLDER);
    assert.equal(instantToWorkspaceCalendarDate("", "Asia/Amman"), null);
  });

  it("J — invalid workspace timezone uses canonical UTC fallback", () => {
    const formatted = formatWorkspaceDisplayDate(R2O_INSTANT, "Not/A_Timezone");
    assert.match(formatted, /Jul 24, 2026/);
    assert.equal(instantToWorkspaceCalendarDate(R2O_INSTANT, "Not/A_Timezone"), "2026-07-24");
    assert.equal(APPLICATION_FALLBACK_TIMEZONE, "UTC");
  });
});
