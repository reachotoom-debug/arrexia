import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";
import ts from "typescript";
import * as pdfShared from "../invoice-pdf-shared";
import { formatClientCurrencyAmounts, sumClientCurrencyAmounts } from "../../clients/currencyPresentation";
import { readAllPages } from "../../db/readAllPages";
import * as jsxRuntime from "react/jsx-runtime";
import { createClient } from "@supabase/supabase-js";

function loadSource(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(code, { exports, console: { log() {}, error() {} }, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return exports;
}

describe("client outstanding warning", () => {
  async function outstanding(rows: Array<{ outstanding: number; display_status: string; currency?: string }>, failLater = false) {
    const requests: URL[] = [];
    const client = createClient("https://fixture.invalid", "fixture-key", {
      auth: { persistSession: false }, global: { fetch: async (input) => {
        const url = new URL(String(input)); requests.push(url);
        const excluded = url.searchParams.getAll("display_status").map(value => value.replace("neq.", ""));
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        if (failLater && offset > 0) return new Response(JSON.stringify({message:"later page failed"}), {status:500});
        return new Response(JSON.stringify(rows.filter(row => !excluded.includes(row.display_status)).slice(offset, offset + limit)));
      } },
    });
    const action = loadSource("app/[workspaceId]/clients/_actions/getClientOutstanding.ts", {
      "@/lib/db/readAllPages": { readAllPages },
      "@/lib/clients/currencyPresentation": { sumClientCurrencyAmounts },
      "@/lib/auth/server": { requireWorkspace: async () => ({}) },
      "@/lib/supabase/server": { supabaseServer: async () => client },
    });
    const result = await action.getClientOutstanding("workspace-fixture", "client-fixture");
    assert.equal(requests[0].searchParams.get("workspace_id"), "eq.workspace-fixture");
    assert.equal(requests[0].searchParams.get("client_id"), "eq.client-fixture");
    return result;
  }
  it("checks warnings beyond 1000 invoices", async () => {
    const rows=Array.from({length:1201},(_,i)=>({outstanding:i===1200?25:0,display_status:"sent"}));
    assert.equal((await outstanding(rows)).outstanding,25);
  });
  it("returns an explicit error after a later warning page fails", async () => {
    const result=await outstanding(Array.from({length:1201},()=>({outstanding:1,display_status:"sent"})),true);
    assert.equal(result.ok,false);
    assert.match(result.error,/later page failed/);
  });
  it("does not net or relabel warning balances across currencies", async () => {
    const result=await outstanding([{outstanding:10,display_status:"sent",currency:"USD"},{outstanding:20,display_status:"sent",currency:"EUR"}]);
    assert.equal(result.hasOutstanding,true);
    assert.equal(result.outstanding,0);
    assert.equal(JSON.stringify(result.outstandingByCurrency),JSON.stringify({USD:10,EUR:20}));
  });
  it("does not warn for a client with draft invoices only", async () => {
    assert.equal((await outstanding([{ outstanding: 100, display_status: "draft" }])).outstanding, 0);
  });
  it("counts sent, overdue and partially paid balances, excluding drafts and void", async () => {
    assert.equal((await outstanding([
      { outstanding: 100, display_status: "draft" }, { outstanding: 900, display_status: "void" },
      { outstanding: 10, display_status: "sent" }, { outstanding: 20, display_status: "overdue" },
      { outstanding: 5, display_status: "partially_paid" }, { outstanding: 0, display_status: "paid" },
    ])).outstanding, 35);
  });
});

describe("client warning presentation", () => {
  it("renders currency-separated balances even with a different workspace default", () => {
    const { ArchiveConfirmDialog } = loadSource("app/[workspaceId]/clients/_components/ArchiveConfirmDialog.tsx", {
      "react": {}, "react/jsx-runtime": jsxRuntime,
      "next/link": { __esModule: true, default: "a" }, "lucide-react": { AlertTriangle: "svg" },
      "@/lib/clients/currencyPresentation": { formatClientCurrencyAmounts },
      "@/lib/format/currency": { formatCurrency: () => "INVALID WORKSPACE TOTAL" },
    });
    const node = ArchiveConfirmDialog({isOpen:true,onClose(){},onConfirm(){},outstanding:0,outstandingByCurrency:{USD:10,EUR:20},workspaceId:"w",clientId:"c",action:"archive",workspaceDefaultCurrency:"JPY"});
    const serialized=JSON.stringify(node);
    assert.match(serialized,/\u20ac20.00 EUR \/ \$10.00 USD/);
    assert.ok(!serialized.includes("INVALID WORKSPACE TOTAL"));
    for (const file of ["app/[workspaceId]/clients/_components/ArchiveCheckbox.tsx","app/[workspaceId]/clients/[clientId]/_components/ToggleClientActive.tsx"]) {
      const source=readFileSync(file,"utf8");
      assert.match(source,/outstandingResult.hasOutstanding/);
      assert.match(source,/outstandingByCurrency=\{outstandingByCurrency\}/);
    }
  });
});

describe("PDF customer content", () => {
  const { InvoicePdfDocument } = loadSource("lib/invoices/InvoicePdfDocument.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "@react-pdf/renderer": { Document: "Document", Page: "Page", View: "View", Text: "Text", Image: "Image", StyleSheet: { create: (x: unknown) => x } },
    "@/lib/format/currency": { formatCurrency: (x: number) => `USD ${x}` },
    "./status-ui": { getInvoiceStatusLabel: (x: string) => x },
    "./invoice-pdf-shared": pdfShared,
  });
  function text(node: any): string {
    if (node == null || typeof node === "boolean") return "";
    if (Array.isArray(node)) return node.map(text).join("\n");
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (typeof node.type === "function") return text(node.type(node.props));
    return text(node.props?.children);
  }
  function render(overrides: Record<string, unknown> = {}) {
    return text(InvoicePdfDocument({ logoSrc: null, invoice: {
      id: "synthetic", invoiceNumber: "FIXTURE-001", issueDate: "2026-10-01", dueDate: "2026-10-31",
      clientName: "Synthetic Customer", currency: "USD", items: [], subtotal: 100, total: 100,
      discountPercent: 0, discountAmount: 0, taxPercent: 0, taxAmount: 0, ...overrides,
    } }));
  }
  it("includes saved terms, multiline customer notes and the thank-you message", () => {
    const output = render({ paymentTermsLabel: "Net 30", notes: "Delivery by Friday\nReference PO-123", thankYouMessage: "Thanks for the project." });
    for (const expected of ["Payment terms", "Net 30", "Delivery by Friday", "Reference PO-123", "Thanks for the project."]) assert.ok(output.includes(expected), expected);
  });
  it("omits empty customer sections", () => {
    const output = render({ paymentTermsLabel: "  ", notes: " \n " });
    assert.ok(!output.includes("Payment terms"));
    assert.ok(!output.includes("Customer notes"));
  });
});

describe("latest grouped import stored totals contract", () => {
  it("persists the supported line-only import total consistently and retains payment locks", () => {
    const candidates = readdirSync("supabase/migrations").sort().filter(name => readFileSync(`supabase/migrations/${name}`, "utf8").includes("CREATE OR REPLACE FUNCTION public.internal_import_invoices_grouped("));
    const sql = readFileSync(`supabase/migrations/${candidates.at(-1)}`, "utf8");
    assert.match(sql, /SET amount = v_subtotal,\s*subtotal = v_subtotal,/);
    for (const field of ["discount_percent", "discount_amount", "tax_percent", "tax_amount"]) assert.match(sql, new RegExp(`${field} = 0`));
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /v_effective_paid > v_new_total \+ v_paid_total_tolerance/);
    assert.match(sql, /COALESCE\(p.net_amount, p.amount\)/);
    assert.match(sql, /RAISE EXCEPTION 'invoice_import_failed'/);
  });
});
