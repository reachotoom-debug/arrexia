import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatClientCurrencyAmounts } from "../../clients/currencyPresentation";
import { formatPaymentTermsLabel } from "../paymentTerms";
import { DashboardInsight } from "@/app/[workspaceId]/dashboard/_components/DashboardInsight";
import type { DashboardSummaryPremium } from "@/app/[workspaceId]/dashboard/_components/PremiumKpiRow";
import { sumCompletedPayments } from "../hydratePrintableInvoice";

it("client amounts use shared symbols and identify every currency, including unknown codes", () => {
  assert.equal(formatClientCurrencyAmounts({USD:20000,EUR:5}), "€5.00 EUR / $20,000.00 USD");
  assert.equal(formatClientCurrencyAmounts({"Unknown currency":5}), "Unknown currency 5.00");
});
it("missing terms remain unspecified and explicit terms retain their meaning", () => {
  assert.equal(formatPaymentTermsLabel(null,null), "—");
  assert.equal(formatPaymentTermsLabel("custom",17), "Custom (17 days)");
  assert.equal(formatPaymentTermsLabel("net_30",30), "Net 30");
});
it("PDF fallback uses effective net payments like the ledger", () => {
  assert.equal(sumCompletedPayments([
    {amount:100,net_amount:97,status:"completed"},
    {amount:20,net_amount:19,status:null},
    {amount:1,net_amount:1,status:"paid"},
    {amount:50,net_amount:50,status:"failed"},
    {amount:50,net_amount:50,status:""},
    {amount:50,net_amount:50,status:"",archived_at:"2026-10-01"},
  ]),117);
});
it("draft-only EUR scope explains activity without first-receivable onboarding", () => {
  const summary = {defaultCurrency:"EUR", invoiceActivity:{issuedCount:0,draftCount:1,voidCount:0},
    totals:{totalInvoiced:0,totalOutstanding:0,overdueAmount:0,highRiskExposure:0},deltas:{}} as unknown as DashboardSummaryPremium;
  const html = renderToStaticMarkup(React.createElement(DashboardInsight,{summary,workspaceId:"w"}));
  assert.match(html,/No issued EUR receivables/);
  assert.match(html,/1 draft/);
  assert.doesNotMatch(html,/first receivable/i);
});
it("a genuinely new workspace retains first-receivable onboarding", () => {
  const summary = {defaultCurrency:"USD",invoiceActivity:{issuedCount:0,draftCount:0,voidCount:0},
    totals:{totalInvoiced:0,totalOutstanding:0,overdueAmount:0,highRiskExposure:0},deltas:{}} as unknown as DashboardSummaryPremium;
  const html = renderToStaticMarkup(React.createElement(DashboardInsight,{summary,workspaceId:"w"}));
  assert.match(html,/first receivable/);
  const scoped = renderToStaticMarkup(React.createElement(DashboardInsight,{summary,workspaceId:"w",isMultiCurrency:true}));
  assert.doesNotMatch(scoped,/first receivable/);
});

it("download and email PDF fallback queries retain net payment values", () => {
  for (const path of ["lib/invoices/invoice-pdf-route.ts","lib/invoices/send-email.ts"]) {
    assert.match(readFileSync(path,"utf8"), /select\("amount, net_amount, status, archived_at"\)/);
  }
});
