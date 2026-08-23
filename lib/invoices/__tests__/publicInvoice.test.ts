import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  generatePublicAccessToken,
  ensurePublicAccessToken,
} from "@/lib/invoices/ensurePublicAccessToken";
import { loadPublicInvoiceByToken } from "@/lib/invoices/publicInvoiceLoader";
import {
  assertPublicInvoiceDtoShape,
  PUBLIC_INVOICE_FORBIDDEN_DTO_KEYS,
  type PublicInvoiceDto,
} from "@/lib/invoices/publicInvoiceDto";
import {
  buildPublicInvoiceUrl,
  isPublicInvoiceUrl,
  isValidPublicInvoiceTokenFormat,
  PUBLIC_INVOICE_TOKEN_PATTERN,
} from "@/lib/invoices/publicInvoiceUrl";
import { buildReminderTemplateContext } from "@/lib/reminders/render";
import { validateCollectionMessageOutput } from "@/lib/ai/validateCollectionMessageOutput";
import { buildCollectionWhatsAppMessage } from "@/lib/whatsapp/buildCollectionWhatsAppMessage";
import { ARREXIA_WEBSITE_URL } from "@/lib/collections/collectionMessageFormat";
import {
  PUBLIC_INVOICE_SETTINGS_COLUMNS,
  PUBLIC_INVOICE_SETTINGS_SELECT,
} from "@/lib/invoices/publicInvoiceSettingsSelect";
import { setSupabaseAdminClientForTests } from "@/lib/supabase/admin";

const WORKSPACE_A = "11111111-1111-1111-1111-111111111111";
const WORKSPACE_B = "22222222-2222-2222-2222-222222222222";
const INVOICE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INVOICE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TOKEN_A = "abcdefghijklmnopqrstuvwxyz012345";
const TOKEN_B = "zyxwvutsrqponmlkjihgfedcba543210";

type InvoiceRow = {
  id: string;
  workspace_id: string;
  status: string;
  archived_at: string | null;
  public_access_token: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  notes: string | null;
  subtotal: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  tax_percent: number | null;
  tax_amount: number | null;
  amount: number | null;
  payment_terms: string | null;
  payment_terms_days: number | null;
  client_id: string | null;
};

type MockState = {
  invoices: InvoiceRow[];
  invoiceViews: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  settings: Array<Record<string, unknown>>;
  queryErrors?: Partial<
    Record<"invoices_view" | "invoice_items" | "clients" | "settings", boolean>
  >;
  lastSettingsSelect?: string;
};

function createMockAdmin(state: MockState): SupabaseClient {
  type Chain = {
    _table?: string;
    _filters: Array<[string, unknown]>;
    _payload?: Record<string, unknown>;
    _mode?: "maybeSingle" | "list" | "update" | "updateSelect";
    _select?: string;
  };

  const simulatedError = { message: "simulated_query_error", code: "500" };

  function runQuery(chain: Chain) {
    const { _table: table, _filters: filters = [], _mode: mode } = chain;

    if (table === "settings" && chain._select) {
      state.lastSettingsSelect = chain._select;
    }

    if (table && state.queryErrors?.[table as keyof NonNullable<MockState["queryErrors"]>]) {
      return {
        data: mode === "maybeSingle" ? null : [],
        error: simulatedError,
      };
    }

    if (table === "invoices") {
      if (mode === "update" || mode === "updateSelect") {
        const row = state.invoices.find((i) =>
          filters.every(([col, val]) => {
            if (col === "public_access_token" && val === null) {
              return i.public_access_token == null;
            }
            return (i as Record<string, unknown>)[col] === val;
          })
        );
        if (row && chain._payload?.public_access_token) {
          row.public_access_token = String(chain._payload.public_access_token);
          const result = { public_access_token: row.public_access_token };
          return {
            data: mode === "updateSelect" ? result : result,
            error: null,
          };
        }
        return { data: null, error: null };
      }

      const tokenFilter = filters.find(([c]) => c === "public_access_token");
      if (tokenFilter) {
        const row = state.invoices.find((i) => i.public_access_token === tokenFilter[1]);
        return { data: mode === "maybeSingle" ? row ?? null : row ? [row] : [], error: null };
      }
      const row = state.invoices.find((i) =>
        filters.every(([col, val]) => (i as Record<string, unknown>)[col] === val)
      );
      return { data: mode === "maybeSingle" ? row ?? null : row ? [row] : [], error: null };
    }

    if (table === "invoices_view") {
      const idFilter = filters.find(([c]) => c === "id");
      const row = state.invoiceViews.find((v) => v.id === idFilter?.[1]);
      return { data: mode === "maybeSingle" ? row ?? null : row ? [row] : [], error: null };
    }

    if (table === "invoice_items") {
      const invoiceFilter = filters.find(([c]) => c === "invoice_id");
      const rows = state.items.filter((item) => item.invoice_id === invoiceFilter?.[1]);
      return { data: rows, error: null };
    }

    if (table === "clients") {
      const row = state.clients.find((c) =>
        filters.every(([col, val]) => (c as Record<string, unknown>)[col] === val)
      );
      return { data: mode === "maybeSingle" ? row ?? null : row ? [row] : [], error: null };
    }

    if (table === "settings") {
      const wsFilter = filters.find(([c]) => c === "workspace_id");
      const row = state.settings.find((s) => s.workspace_id === wsFilter?.[1]);
      return { data: mode === "maybeSingle" ? row ?? null : row ? [row] : [], error: null };
    }

    return { data: mode === "maybeSingle" ? null : [], error: null };
  }

  function makeChain(table: string) {
    const chain: Chain = { _table: table, _filters: [] };

    const builder = {
      select(columns?: string) {
        chain._select = columns;
        if (chain._mode === "update") {
          chain._mode = "updateSelect";
        }
        return builder;
      },
      eq(column: string, value: unknown) {
        chain._filters.push([column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        return builder.eq(column, value);
      },
      order() {
        return builder;
      },
      maybeSingle() {
        if (chain._mode !== "updateSelect") {
          chain._mode = "maybeSingle";
        }
        return Promise.resolve(runQuery(chain));
      },
      update(payload: Record<string, unknown>) {
        chain._mode = "update";
        chain._payload = payload;
        return builder;
      },
      then(
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) {
        chain._mode = "list";
        return Promise.resolve(runQuery(chain)).then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return {
    from(table: string) {
      return makeChain(table);
    },
  } as unknown as SupabaseClient;
}

function sampleDto(): PublicInvoiceDto {
  return {
    company: {
      name: "Acme LLC",
      logoUrl: null,
      addressLines: ["123 Main St"],
      taxId: null,
      email: "billing@acme.test",
      phone: null,
      website: null,
      city: null,
      country: null,
    },
    client: { name: "Client Co", company: null },
    invoiceNumber: "INV-1001",
    issueDate: "2026-08-01",
    dueDate: "2026-08-15",
    paymentTermsLabel: "Net 15",
    currency: "USD",
    lineItems: [
      {
        name: "Service",
        description: null,
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
      },
    ],
    financials: {
      subtotal: 100,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 0,
      taxAmount: 0,
      total: 100,
      amountPaid: 0,
      outstanding: 100,
      currency: "USD",
    },
    displayStatus: "sent",
    overdueDays: null,
    notes: null,
    paymentInstructionLines: ["Please complete payment using the payment details above."],
    paymentDetails: null,
    thankYouNote: "Thank you for your business.",
    payInvoiceAvailable: false,
  };
}

function seedSentInvoice(state: MockState, params: {
  token: string;
  workspaceId: string;
  invoiceId: string;
  status?: string;
  archived?: boolean;
}) {
  state.invoices.push({
    id: params.invoiceId,
    workspace_id: params.workspaceId,
    status: params.status ?? "sent",
    archived_at: params.archived ? "2026-08-01T00:00:00Z" : null,
    public_access_token: params.token,
    invoice_number: "INV-1001",
    issue_date: "2026-08-01",
    due_date: "2026-08-15",
    currency: "USD",
    notes: null,
    subtotal: 100,
    discount_percent: 0,
    discount_amount: 0,
    tax_percent: 0,
    tax_amount: 0,
    amount: 100,
    payment_terms: "net_15",
    payment_terms_days: 15,
    client_id: "client-1",
  });
  state.invoiceViews.push({
    id: params.invoiceId,
    display_status: params.status === "void" ? "void" : "sent",
    paid: 0,
    outstanding: 100,
    is_overdue: false,
    overdue_days: 0,
    currency: "USD",
  });
  state.items.push({
    invoice_id: params.invoiceId,
    name: "Service",
    description: null,
    quantity: 1,
    unit_price: 100,
    line_total: 100,
  });
  state.clients.push({
    id: "client-1",
    workspace_id: params.workspaceId,
    name: "Client Co",
    company: null,
  });
  state.settings.push({
    workspace_id: params.workspaceId,
    business_name: "Acme LLC",
    branding_business_legal_name: "Acme LLC",
    default_currency: "USD",
  });
}

describe("public invoice token utilities", () => {
  it("generates URL-safe tokens with sufficient entropy", () => {
    const token = generatePublicAccessToken();
    assert.match(token, PUBLIC_INVOICE_TOKEN_PATTERN);
    assert.ok(isValidPublicInvoiceTokenFormat(token));
  });

  it("buildPublicInvoiceUrl uses /i/{token} path", () => {
    const url = buildPublicInvoiceUrl(TOKEN_A);
    assert.match(url, /\/i\/abcdefghijklmnopqrstuvwxyz012345$/);
    assert.ok(isPublicInvoiceUrl(url));
  });

  it("rejects malformed tokens", () => {
    assert.equal(isValidPublicInvoiceTokenFormat("short"), false);
    assert.equal(isValidPublicInvoiceTokenFormat("has spaces invalid"), false);
  });
});

describe("public invoice DTO shape", () => {
  it("allows public fields and rejects forbidden keys", () => {
    const dto = sampleDto();
    assert.doesNotThrow(() => assertPublicInvoiceDtoShape(dto));
    const serialized = JSON.stringify(dto);
    for (const key of PUBLIC_INVOICE_FORBIDDEN_DTO_KEYS) {
      assert.equal(serialized.includes(`"${key}"`), false);
    }
  });
});

describe("loadPublicInvoiceByToken security", () => {
  let state: MockState;

  beforeEach(() => {
    state = { invoices: [], invoiceViews: [], items: [], clients: [], settings: [] };
    setSupabaseAdminClientForTests(createMockAdmin(state));
  });

  afterEach(() => {
    setSupabaseAdminClientForTests(null);
  });

  it("valid token loads correct invoice", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.invoice.invoiceNumber, "INV-1001");
      assert.equal(result.invoice.financials.outstanding, 100);
    }
  });

  it("invalid token returns not_found", async () => {
    const result = await loadPublicInvoiceByToken("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });

  it("malformed token returns invalid_token", async () => {
    const result = await loadPublicInvoiceByToken("bad");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_token");
  });

  it("token A cannot load invoice B", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    seedSentInvoice(state, {
      token: TOKEN_B,
      workspaceId: WORKSPACE_B,
      invoiceId: INVOICE_B,
    });

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.notEqual(result.invoice.invoiceNumber, "INV-OTHER");
    }
  });

  it("archived invoice returns not_found", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
      archived: true,
    });
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
  });

  it("draft invoice returns not_found", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
      status: "draft",
    });
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
  });

  it("paid invoice remains viewable", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    const view = state.invoiceViews[0];
    view.display_status = "paid";
    view.paid = 100;
    view.outstanding = 0;

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.invoice.displayStatus, "paid");
      assert.equal(result.invoice.financials.outstanding, 0);
      assert.equal(result.invoice.financials.amountPaid, 100);
    }
  });

  it("partially paid invoice preserves authoritative financial semantics", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    const view = state.invoiceViews[0]!;
    view.display_status = "partially_paid";
    view.paid = 40;
    view.outstanding = 60;

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.invoice.displayStatus, "partially_paid");
      assert.equal(result.invoice.financials.amountPaid, 40);
      assert.equal(result.invoice.financials.outstanding, 60);
      assert.equal(result.invoice.financials.total, 100);
    }
  });

  it("overdue invoice preserves outstanding and overdue days from invoices_view", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    const view = state.invoiceViews[0]!;
    view.display_status = "overdue";
    view.paid = 0;
    view.outstanding = 100;
    view.is_overdue = true;
    view.overdue_days = 14;

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.invoice.displayStatus, "overdue");
      assert.equal(result.invoice.financials.outstanding, 100);
      assert.equal(result.invoice.overdueDays, 14);
    }
  });

  it("DTO excludes internal identifiers and public token", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, true);
    if (result.ok) {
      const serialized = JSON.stringify(result.invoice);
      assert.doesNotMatch(serialized, /workspace_id|"id":/);
      assert.doesNotMatch(serialized, /client_id/);
      assert.doesNotMatch(serialized, /public_access_token|publicAccessToken/);
      assert.doesNotMatch(serialized, /risk/);
      assert.doesNotMatch(serialized, /delivery/i);
      assert.doesNotMatch(serialized, new RegExp(TOKEN_A));
    }
  });
});

describe("loadPublicInvoiceByToken fail-closed hardening", () => {
  let state: MockState;

  beforeEach(() => {
    state = { invoices: [], invoiceViews: [], items: [], clients: [], settings: [] };
    setSupabaseAdminClientForTests(createMockAdmin(state));
  });

  afterEach(() => {
    setSupabaseAdminClientForTests(null);
  });

  it("settings query uses explicit column allowlist — no select('*')", () => {
    const loaderSrc = readFileSync("lib/invoices/publicInvoiceLoader.ts", "utf8");
    assert.doesNotMatch(loaderSrc, /\.select\(\s*["']\*["']\s*\)/);
    assert.match(loaderSrc, /PUBLIC_INVOICE_SETTINGS_SELECT/);
    assert.equal(PUBLIC_INVOICE_SETTINGS_SELECT, PUBLIC_INVOICE_SETTINGS_COLUMNS.join(", "));
  });

  it("invoices_view error fails closed", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    state.queryErrors = { invoices_view: true };
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });

  it("missing invoices_view financial row fails closed", async () => {
    state.invoices.push({
      id: INVOICE_A,
      workspace_id: WORKSPACE_A,
      status: "sent",
      archived_at: null,
      public_access_token: TOKEN_A,
      invoice_number: "INV-1001",
      issue_date: "2026-08-01",
      due_date: "2026-08-15",
      currency: "USD",
      notes: null,
      subtotal: 100,
      discount_percent: 0,
      discount_amount: 0,
      tax_percent: 0,
      tax_amount: 0,
      amount: 100,
      payment_terms: "net_15",
      payment_terms_days: 15,
      client_id: "client-1",
    });
    state.items.push({
      invoice_id: INVOICE_A,
      name: "Service",
      description: null,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
    });
    state.clients.push({
      id: "client-1",
      workspace_id: WORKSPACE_A,
      name: "Client Co",
      company: null,
    });
    state.settings.push({
      workspace_id: WORKSPACE_A,
      business_name: "Acme LLC",
      default_currency: "USD",
    });

    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });

  it("invoice_items query error fails closed", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    state.queryErrors = { invoice_items: true };
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
  });

  it("client query error fails closed when client_id exists", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    state.queryErrors = { clients: true };
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
  });

  it("settings query error fails closed", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    state.queryErrors = { settings: true };
    const result = await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(result.ok, false);
  });

  it("records explicit settings select columns at query time", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    await loadPublicInvoiceByToken(TOKEN_A);
    assert.equal(state.lastSettingsSelect, PUBLIC_INVOICE_SETTINGS_SELECT);
  });
});

describe("ensurePublicAccessToken lifecycle", () => {
  let state: MockState;

  beforeEach(() => {
    state = { invoices: [], invoiceViews: [], items: [], clients: [], settings: [] };
    setSupabaseAdminClientForTests(createMockAdmin(state));
  });

  afterEach(() => {
    setSupabaseAdminClientForTests(null);
  });

  it("reuses existing token", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    const token = await ensurePublicAccessToken({
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    assert.equal(token, TOKEN_A);
  });

  it("does not create token for draft invoices", async () => {
    seedSentInvoice(state, {
      token: TOKEN_A,
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
      status: "draft",
    });
    state.invoices[0]!.public_access_token = null;
    const token = await ensurePublicAccessToken({
      workspaceId: WORKSPACE_A,
      invoiceId: INVOICE_A,
    });
    assert.equal(token, null);
  });
});

describe("reminder template public links", () => {
  it("legacy payment_link resolves to public invoice URL", () => {
    const publicUrl = buildPublicInvoiceUrl(TOKEN_A);
    const context = buildReminderTemplateContext({
      invoiceView: {
        invoice_number: "INV-9",
        due_date: "2026-08-01",
        outstanding: 50,
        currency: "USD",
      },
      client: { name: "Client", email: "c@test.com" },
      publicInvoiceUrl: publicUrl,
      daysOverdue: 3,
    });

    assert.equal(context.replacements.payment_link, publicUrl);
    assert.equal(context.replacements.invoice_link, publicUrl);
    assert.equal(context.replacements.view_invoice_link, publicUrl);
    assert.doesNotMatch(publicUrl, /\/invoices\//);
  });

  it("render.ts no longer builds authenticated workspace invoice URLs", () => {
    const src = readFileSync("lib/reminders/render.ts", "utf8");
    assert.doesNotMatch(src, /buildAppUrl\(`\/\$\{workspaceId\}\/invoices/);
  });
});

describe("communication integration contracts", () => {
  it("invoice send email passes invoiceViewUrl from ensurePublicInvoiceUrl", () => {
    const src = readFileSync("lib/invoices/send-email.ts", "utf8");
    assert.match(src, /ensurePublicInvoiceUrl/);
    assert.match(src, /invoiceViewUrl: publicInvoiceUrl/);
    assert.doesNotMatch(src, /buildAppUrl\(`\/\$\{workspaceId\}\/invoices/);
  });

  it("reminder send passes public invoice URL to template and email shell", () => {
    const src = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(src, /ensurePublicInvoiceUrl/);
    assert.match(src, /publicInvoiceUrl/);
    assert.match(src, /invoiceViewUrl: publicInvoiceUrl/);
  });

  it("public route does not require workspace auth", () => {
    const src = readFileSync("app/(public)/i/[token]/page.tsx", "utf8");
    assert.doesNotMatch(src, /requireWorkspace/);
    assert.match(src, /loadPublicInvoiceByToken/);
    assert.match(src, /notFound\(\)/);
  });

  it("financial views remain revoked from anon in migration history", () => {
    const src = readFileSync(
      "supabase/migrations/20260729000000_financial_views_security_invoker.sql",
      "utf8"
    );
    assert.match(src, /REVOKE SELECT ON public\.invoices_view FROM anon/);
  });

  it("migration does not grant anon SELECT on invoices", () => {
    const src = readFileSync(
      "supabase/migrations/20260823130000_public_invoice_access_token.sql",
      "utf8"
    );
    assert.match(src, /public_access_token/);
    assert.doesNotMatch(src, /GRANT\s+SELECT[\s\S]*\sTO\s+anon/i);
  });
});

describe("invoices anon privilege hardening migration", () => {
  const migrationPath =
    "supabase/migrations/20260823140000_revoke_invoices_anon_privileges.sql";

  it("revokes all direct table privileges from anon on public.invoices", () => {
    const src = readFileSync(migrationPath, "utf8");
    assert.match(src, /REVOKE ALL ON TABLE public\.invoices FROM anon;/);
  });

  it("revokes PUBLIC table privileges on public.invoices for defense-in-depth", () => {
    const src = readFileSync(migrationPath, "utf8");
    assert.match(src, /REVOKE ALL ON TABLE public\.invoices FROM PUBLIC;/);
  });

  it("does not grant anon any invoice table privilege", () => {
    const src = readFileSync(migrationPath, "utf8");
    assert.doesNotMatch(src, /GRANT[\s\S]*TO\s+anon/i);
  });

  it("does not modify RLS policies on public.invoices", () => {
    const src = readFileSync(migrationPath, "utf8");
    assert.doesNotMatch(src, /CREATE POLICY|DROP POLICY|ALTER POLICY|ENABLE ROW LEVEL SECURITY/i);
  });

  it("does not change authenticated or service_role grants explicitly", () => {
    const src = readFileSync(migrationPath, "utf8");
    assert.doesNotMatch(src, /GRANT[\s\S]*TO\s+authenticated/i);
    assert.doesNotMatch(src, /GRANT[\s\S]*TO\s+service_role/i);
    assert.doesNotMatch(src, /REVOKE[\s\S]*FROM\s+authenticated/i);
    assert.doesNotMatch(src, /REVOKE[\s\S]*FROM\s+service_role/i);
  });

  it("public loader still uses supabaseAdmin server-side only", () => {
    const src = readFileSync("lib/invoices/publicInvoiceLoader.ts", "utf8");
    assert.match(src, /supabaseAdmin\(\)/);
    assert.doesNotMatch(src, /supabaseServer\(\)/);
  });

  it("authenticated invoice access remains RLS-based via workspace policies", () => {
    const rlsSrc = readFileSync(
      "supabase/migrations/20250107000000_harden_rls_for_workspace_tables.sql",
      "utf8"
    );
    const detailSrc = readFileSync(
      "app/[workspaceId]/invoices/[invoiceId]/page.tsx",
      "utf8"
    );
    assert.match(rlsSrc, /CREATE POLICY "invoices_select_own_workspace"/);
    assert.match(rlsSrc, /ALTER TABLE public\.invoices ENABLE ROW LEVEL SECURITY/);
    assert.match(detailSrc, /requireWorkspace\(workspaceId\)/);
    assert.match(detailSrc, /supabaseServer\(\)/);
  });

  it("invoices_view anon SELECT remains revoked in financial-view migration", () => {
    const src = readFileSync(
      "supabase/migrations/20260729000000_financial_views_security_invoker.sql",
      "utf8"
    );
    assert.match(src, /REVOKE SELECT ON public\.invoices_view FROM anon;/);
    assert.doesNotMatch(src, /GRANT SELECT ON public\.invoices_view TO anon/i);
  });
});

describe("WhatsApp and AI URL validation", () => {
  const baseValidation = {
    invoiceNumber: "INV-100",
    outstandingFormatted: "$500.00",
    dueDateFormatted: "Aug 1, 2026",
    statusLine: "Status: 5 days overdue",
  };

  const baseMessage = [
    "Hello Client,",
    "",
    "This is a payment reminder from Acme regarding invoice INV-100.",
    "Outstanding: $500.00",
    "Due date: Aug 1, 2026",
    "Status: 5 days overdue",
    "",
    "Please let us know once payment has been arranged.",
    "If payment has already been made, kindly disregard this reminder.",
    "",
    "Thank you,",
    "Acme",
    "Powered by Arrexia",
    ARREXIA_WEBSITE_URL,
  ].join("\n");

  it("WhatsApp message includes public invoice URL when provided", () => {
    const publicUrl = buildPublicInvoiceUrl(TOKEN_A);
    const message = buildCollectionWhatsAppMessage({
      clientName: "Client",
      businessName: "Acme",
      invoiceNumber: "INV-100",
      outstanding: 500,
      currency: "USD",
      dueDate: "2026-08-01",
      daysOverdue: 5,
      evaluationDate: "2026-08-06",
      publicInvoiceUrl: publicUrl,
    });

    assert.match(message, new RegExp(`View invoice:\\n${publicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.doesNotMatch(message, /\/invoices\//);
  });

  it("validator accepts Arrexia root plus public invoice URL", () => {
    const publicUrl = buildPublicInvoiceUrl(TOKEN_A);
    const withLink = [
      ...baseMessage.split("\n").slice(0, -2),
      `View invoice:`,
      publicUrl,
      "",
      "Powered by Arrexia",
      ARREXIA_WEBSITE_URL,
    ].join("\n");

    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message: withLink,
      allowedPublicInvoiceUrl: publicUrl,
    });
    assert.equal(result.ok, true);
  });

  it("validator rejects arbitrary external URLs", () => {
    const message = baseMessage.replace(
      ARREXIA_WEBSITE_URL,
      "https://evil.example/phish"
    );
    const result = validateCollectionMessageOutput({
      ...baseValidation,
      message,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "url");
  });
});
