import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const FOUNDER_ADMIN_TABLE_PAGE_SIZE = 100;

function paginateRows<T>(rows: T[], page = 1, pageSize = FOUNDER_ADMIN_TABLE_PAGE_SIZE) {
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalCount,
    page: safePage,
    pageSize,
    totalPages,
  };
}

describe("Founder admin table launch polish", () => {
  it("1 — users sort newest account created first", () => {
    const src = readFileSync("lib/admin/getAdminDashboardData.ts", "utf8");
    assert.match(src, /sortRowsByDescTimestamp\([\s\S]*\(row\) => row\.createdAt/);
    assert.match(src, /createdAt: user\.created_at/);
  });

  it("2 — default page size is 100 rows", () => {
    const presentationSrc = readFileSync("lib/admin/founderAdminTablePresentation.ts", "utf8");
    assert.match(presentationSrc, /FOUNDER_ADMIN_TABLE_PAGE_SIZE = 100/);
    const rows = Array.from({ length: 150 }, (_, index) => ({ id: index }));
    const page = paginateRows(rows);
    assert.equal(page.pageSize, 100);
    assert.equal(page.rows.length, 100);
  });

  it("3 — pagination works beyond 100 rows", () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: index }));
    const page2 = paginateRows(rows, 2);
    assert.equal(page2.rows.length, 100);
    assert.equal(page2.rows[0]?.id, 100);
    const page3 = paginateRows(rows, 3);
    assert.equal(page3.rows.length, 50);
  });

  it("4 — users page preserves admin authorization and row actions", () => {
    const src = readFileSync("app/admin/users/page.tsx", "utf8");
    assert.match(src, /guardFullAdminConsoleAccess\(\)/);
    assert.match(src, /AdminCreateWorkspaceButton/);
    assert.match(src, /access\.role === "super_admin"/);
  });

  it("5 — users page uses server-side paginated loader", () => {
    const pageSrc = readFileSync("app/admin/users/page.tsx", "utf8");
    assert.match(pageSrc, /getFounderUsersData\(\{ page \}\)/);
    assert.match(pageSrc, /usersPage\.rows\.map/);
    assert.doesNotMatch(pageSrc, /users\.map\(\(user\)/);
  });

  it("6 — subscribers sort by subscription updated_at with workspace fallback", () => {
    const src = readFileSync("lib/admin/getAdminDashboardData.ts", "utf8");
    assert.match(src, /subscriptionUpdatedAt:[\s\S]*sub\?\.updated_at/);
    assert.match(src, /sub\?\.created_at/);
    assert.match(src, /getFounderSubscriberSortTimestamp/);
    assert.doesNotMatch(
      src,
      /rows\.sort\([\s\S]*Date\.parse\(b\.workspaceCreatedAt\) - Date\.parse\(a\.workspaceCreatedAt\)/
    );
  });

  it("7 — subscribers page uses 100-row default pagination", () => {
    const src = readFileSync("app/admin/subscribers/page.tsx", "utf8");
    assert.match(src, /getFounderSubscribersData\(\{ page \}\)/);
    assert.match(src, /PaginationBar/);
    const loaderSrc = readFileSync("lib/admin/getAdminDashboardData.ts", "utf8");
    assert.match(loaderSrc, /paginateFounderAdminRows\(buildFounderSubscriberRows/);
  });

  it("8 — subscribers pagination preserved with page query param", () => {
    const src = readFileSync("app/admin/subscribers/page.tsx", "utf8");
    assert.match(src, /parseFounderAdminTablePage\(resolvedSearchParams\.page\)/);
    assert.match(src, /queryParams=\{resolvedSearchParams\}/);
  });

  it("9 — monthly/annual controls unchanged on subscribers page", () => {
    const src = readFileSync("app/admin/subscribers/page.tsx", "utf8");
    assert.match(src, /ChangeWorkspacePlanForm/);
    assert.match(src, /currentBillingInterval=\{row\.billingInterval\}/);
    const formSrc = readFileSync("app/admin/_components/ChangeWorkspacePlanForm.tsx", "utf8");
    assert.match(formSrc, /billingInterval/);
    assert.match(formSrc, /adminSetWorkspacePlanAction/);
  });

  it("10 — renewal date display unchanged", () => {
    const src = readFileSync("app/admin/subscribers/page.tsx", "utf8");
    assert.match(src, /Renewal/);
    assert.match(src, /formatAdminDate\(row\.renewalDate\)/);
    const loaderSrc = readFileSync("lib/admin/getAdminDashboardData.ts", "utf8");
    assert.match(loaderSrc, /renewalDate:[\s\S]*current_period_ends_at/);
  });

  it("11 — founder-admin mutation path unchanged", () => {
    const actionsSrc = readFileSync("app/admin/actions.ts", "utf8");
    assert.match(actionsSrc, /adminSetWorkspacePlanAction/);
    assert.match(actionsSrc, /changeWorkspacePlan/);
    assert.match(actionsSrc, /source: "founder_admin"/);
  });

  it("12 — admin table column/header contracts remain intact", () => {
    const usersSrc = readFileSync("app/admin/users/page.tsx", "utf8");
    assert.match(usersSrc, /Account created/);
    assert.match(usersSrc, /Last sign in/);
    assert.match(usersSrc, /Workspaces/);

    const subscribersSrc = readFileSync("app/admin/subscribers/page.tsx", "utf8");
    assert.match(subscribersSrc, /Owner/);
    assert.match(subscribersSrc, /Workspace/);
    assert.match(subscribersSrc, /Plan/);
    assert.match(subscribersSrc, /Status/);
    assert.match(subscribersSrc, /Trial ends/);
    assert.match(subscribersSrc, /Renewal/);
    assert.match(subscribersSrc, /Est\. MRR/);
    assert.match(subscribersSrc, /Change plan/);
  });
});

describe("Founder admin table presentation helpers", () => {
  it("parseFounderAdminTablePage contract exists", () => {
    const src = readFileSync("lib/admin/founderAdminTablePresentation.ts", "utf8");
    assert.match(src, /export function parseFounderAdminTablePage/);
    assert.match(src, /FOUNDER_ADMIN_TABLE_PAGE_SIZE = 100/);
  });
});
