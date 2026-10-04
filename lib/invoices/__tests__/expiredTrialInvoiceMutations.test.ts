import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { EntitlementError, TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";
import { isExpectedUpdateInvoiceError } from "../mapUpdateInvoiceError";
import type { InvoiceFormValues } from "../schema";

const requireForTest = createRequire(__filename);

const workspaceId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const failure = { ok: false, code: "TRIAL_EXPIRED", error: TRIAL_EXPIRED_MESSAGE };
const values: InvoiceFormValues = { clientId: workspaceId, invoiceNumber: "INV-0001", issueDate: "2026-10-04", dueDate: "2026-11-03", status: "draft", paymentTerms: "net_30", items: [{ name: "Service", quantity: 1, unit_price: 100 }] };
const timer = { mark() {}, markError() {} };

function load(path: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, require: (name: string) => name in mocks ? mocks[name] : requireForTest(name), console: { log() {}, error() {}, warn() {} } });
  return exports;
}

async function createPage(result: unknown) {
  const redirects: string[] = [];
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "order"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [] });
  const page = load("app/[workspaceId]/invoices/new/page.tsx", {
    "next/navigation": { redirect: (url: string) => { redirects.push(url); throw { digest: "NEXT_REDIRECT" }; } },
    "@/lib/supabase/server": { supabaseServer: async () => ({ from: () => chain }) },
    "../_components/InvoiceForm": { InvoiceForm: "InvoiceForm" },
    "../actions": { createInvoice: async () => result, getNextInvoiceNumber: async () => "INV-0001" },
    "@/lib/settings/loadSettings": { loadWorkspaceSettings: async () => ({ payments: { defaultCurrency: "USD" }, timezone: "UTC" }) },
    "@/lib/invoices/createInvoiceInstrumentation": { createCreateInvoiceActionInstrumentation: () => timer, isNextRedirectError: (e: any) => e?.digest === "NEXT_REDIRECT" },
  });
  const element = await page.default({ params: Promise.resolve({ workspaceId }), searchParams: Promise.resolve({}) });
  return { submit: element.props.onSubmit, redirects };
}

test("invoice create returns TRIAL_EXPIRED to the form without constructing any invoice URL", async () => {
  const page = await createPage(failure);
  assert.equal(await page.submit(values), failure);
  assert.deepEqual(page.redirects, []);
});
test("invoice create preserves field errors without redirect", async () => {
  const fieldFailure = { ok: false, fieldErrors: { invoice_number: "Invoice number already exists." } };
  const page = await createPage(fieldFailure);
  assert.equal(await page.submit(values), fieldFailure);
  assert.deepEqual(page.redirects, []);
});
test("successful invoice create redirects to the confirmed invoice UUID", async () => {
  const page = await createPage(invoiceId);
  await assert.rejects(page.submit(values), (e: any) => e.digest === "NEXT_REDIRECT");
  assert.deepEqual(page.redirects, [`/${workspaceId}/invoices/${invoiceId}`]);
});
test("malformed invoice creation success cannot construct an invoice URL", async () => {
  for (const result of ["", "[object Object]", {}, undefined]) {
    const page = await createPage(result);
    await assert.rejects(page.submit(values));
    assert.deepEqual(page.redirects, []);
  }
});

function formHarness(result: unknown) {
  const states: unknown[] = [];
  let index = 0;
  const fieldErrors: unknown[] = [];
  const component = load("app/[workspaceId]/invoices/_components/InvoiceForm.tsx", {
    react: { useState: (initial: unknown) => { const slot = index++; if (!(slot in states)) states[slot] = initial; return [states[slot], (value: unknown) => { states[slot] = value; }]; }, useMemo: (fn: () => unknown) => fn(), useEffect() {} },
    "next/link": { default: "a", __esModule: true },
    "next/navigation": { useRouter: () => ({ push() {} }) },
    "react-hook-form": { useForm: () => ({ register: () => ({}), control: {}, handleSubmit: (fn: unknown) => fn, watch: (key: keyof InvoiceFormValues) => values[key], formState: { errors: {}, isSubmitting: false }, setValue() {}, setError: (...args: unknown[]) => fieldErrors.push(args) }), useFieldArray: () => ({ fields: [], append() {}, remove() {} }) },
  });
  const render = () => { index = 0; return component.InvoiceForm({ mode: "create", clients: [], workspaceId, onSubmit: async () => result }); };
  return { render, fieldErrors };
}
function renderedText(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  return renderedText(node.props?.children);
}
test("InvoiceForm displays the canonical structured trial rejection", async () => {
  const form = formHarness(failure);
  await form.render().props.onSubmit(values);
  assert.match(renderedText(form.render()), /Your Arrexia trial has ended\. Choose a paid plan to continue making changes\./);
  assert.deepEqual(form.fieldErrors, []);
});
test("InvoiceForm retains invoice-number field validation", async () => {
  const form = formHarness({ ok: false, fieldErrors: { invoice_number: "Duplicate invoice number" } });
  await form.render().props.onSubmit(values);
  assert.deepEqual(JSON.parse(JSON.stringify(form.fieldErrors)), [["invoiceNumber", { type: "server", message: "Duplicate invoice number" }]]);
});
test("invoice update recognizes TRIAL_EXPIRED structurally and keeps unexpected errors unexpected", () => {
  assert.equal(isExpectedUpdateInvoiceError({ code: "TRIAL_EXPIRED", error: "Different copy" }), true);
  assert.equal(isExpectedUpdateInvoiceError(failure), true);
  assert.equal(isExpectedUpdateInvoiceError({ code: "08006", error: "Database connection failed" }), false);
});

async function editPage(result: unknown, submitError?: string) {
  const redirects: string[] = [];
  const invoice = { id: invoiceId, client_id: workspaceId, invoice_number: "INV-0001", issue_date: "2026-10-04", due_date: "2026-11-03", status: "draft", archived_at: null };
  const page = load("app/[workspaceId]/invoices/[invoiceId]/edit/page.tsx", {
    "next/navigation": { redirect: (url: string) => { redirects.push(url); throw { digest: "NEXT_REDIRECT" }; }, notFound: () => { throw new Error("Unexpected 404"); } },
    "@/lib/auth/server": { requireWorkspace: async () => ({ workspace: { id: workspaceId } }) },
    "@/lib/supabase/server": { supabaseServer: async () => ({ from: (table: string) => {
      const data = table === "invoices" ? invoice : table === "invoices_view" ? { outstanding: 100 } : table === "invoice_items" ? [] : { id: workspaceId, name: "Client" };
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data, error: null });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
      return chain;
    } }) },
    "@/lib/perf/server": { createRoutePerf: () => ({ time: (_: string, fn: () => unknown) => fn(), finish() {} }), perfTime: (_: string, __: string, fn: () => unknown) => fn() },
    "../../_components/InvoiceForm": { InvoiceForm: "InvoiceForm" },
    "../../actions": { updateInvoice: async () => result },
  });
  const element = await page.default({ params: Promise.resolve({ workspaceId, invoiceId }), searchParams: Promise.resolve({ error: submitError }) });
  const form = element.props.children.find((child: any) => child?.type === "InvoiceForm");
  return { submit: form.props.onSubmit, submitError: form.props.submitError, redirects };
}
test("invoice edit routes trial rejection back to the existing error banner without 404 or unexpected throw", async () => {
  const page = await editPage(failure);
  await assert.rejects(page.submit(values), (e: any) => e.digest === "NEXT_REDIRECT");
  assert.deepEqual(page.redirects, [`/${workspaceId}/invoices/${invoiceId}/edit?error=${encodeURIComponent(TRIAL_EXPIRED_MESSAGE)}`]);
  const redirected = await editPage(failure, TRIAL_EXPIRED_MESSAGE);
  assert.equal(redirected.submitError, TRIAL_EXPIRED_MESSAGE);
});
test("invoice edit still throws genuine unexpected errors", async () => {
  const page = await editPage({ code: "08006", error: "Connection failed" });
  await assert.rejects(page.submit(values), /Connection failed/);
  assert.deepEqual(page.redirects, []);
});

function blockedActions() {
  const effects: string[] = [];
  const reject = async () => { effects.push("guard"); throw new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE); };
  const actions = load("app/[workspaceId]/invoices/actions.ts", {
    "@/lib/auth/server": { requireUser: async () => ({ user: { id: "user" } }), requireWorkspace: async () => ({ workspace: { id: workspaceId, organization_id: "org" } }) },
    "@/lib/billing/assertWithinPlanLimits": { assertInvoiceCreateAllowed: reject },
    "@/lib/billing/entitlementGuard": { assertWorkspaceMutationAllowed: reject },
    "@/lib/supabase/server": { supabaseServer: async () => { effects.push("database"); throw new Error("Must not reach database"); } },
    "@/lib/audit/log": { logAuditEvent: async () => effects.push("audit") },
    "next/cache": { revalidatePath: () => effects.push("revalidate") },
    "@/lib/invoices/createInvoiceInstrumentation": { createCreateInvoiceInstrumentation: () => timer, isNextRedirectError: () => false },
  });
  return { actions, effects };
}
test("expired invoice creation performs zero database/RPC/audit/revalidation effects", async () => {
  const { actions, effects } = blockedActions();
  assert.deepEqual(JSON.parse(JSON.stringify(await actions.createInvoice(workspaceId, values))), failure);
  assert.deepEqual(effects, ["guard"]);
});
for (const scenario of ["edit", "void", "status", "items"]) test(`expired shared invoice ${scenario} update performs zero mutations`, async () => {
  const { actions, effects } = blockedActions();
  const input = { ...values, status: scenario === "void" ? "void" : scenario === "status" ? "sent" : "draft", items: scenario === "items" ? [{ name: "Changed", quantity: 2, unit_price: 50 }] : values.items };
  const result = await actions.updateInvoice(workspaceId, invoiceId, input);
  assert.equal(result.code, "TRIAL_EXPIRED");
  assert.equal(result.error, TRIAL_EXPIRED_MESSAGE);
  assert.deepEqual(effects, ["guard"]);
});
