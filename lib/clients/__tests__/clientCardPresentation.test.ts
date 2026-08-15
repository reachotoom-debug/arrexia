import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildClientCardContactLines } from "@/lib/clients/clientCardPresentation";

const CARD_VIEW = "app/[workspaceId]/clients/_components/ClientsCardView.tsx";

describe("buildClientCardContactLines", () => {
  it("labels phone, WhatsApp, payment terms, and country when all present", () => {
    const lines = buildClientCardContactLines({
      phone: "+962779610078",
      whatsapp: "+962779504134",
      paymentTerms: 30,
      country: "Jordan",
    });

    assert.deepEqual(lines, [
      "Phone: +962779610078",
      "WhatsApp: +962779504134",
      "Payment terms: Net 30",
      "Jordan",
    ]);
  });

  it("omits phone line when phone is null", () => {
    const lines = buildClientCardContactLines({
      phone: null,
      whatsapp: "+962779504134",
      paymentTerms: 30,
      country: "Jordan",
    });

    assert.deepEqual(lines, [
      "WhatsApp: +962779504134",
      "Payment terms: Net 30",
      "Jordan",
    ]);
  });

  it("omits WhatsApp line when WhatsApp is null", () => {
    const lines = buildClientCardContactLines({
      phone: "+962779610078",
      whatsapp: null,
      paymentTerms: 30,
      country: "Jordan",
    });

    assert.deepEqual(lines, [
      "Phone: +962779610078",
      "Payment terms: Net 30",
      "Jordan",
    ]);
  });

  it("omits payment terms line when payment terms is null", () => {
    const lines = buildClientCardContactLines({
      phone: "+962779610078",
      whatsapp: "+962779504134",
      paymentTerms: null,
      country: "Jordan",
    });

    assert.deepEqual(lines, [
      "Phone: +962779610078",
      "WhatsApp: +962779504134",
      "Jordan",
    ]);
  });

  it("omits country when country is null", () => {
    const lines = buildClientCardContactLines({
      phone: "+962779610078",
      whatsapp: "+962779504134",
      paymentTerms: 30,
      country: null,
    });

    assert.deepEqual(lines, [
      "Phone: +962779610078",
      "WhatsApp: +962779504134",
      "Payment terms: Net 30",
    ]);
  });

  it("returns no lines when all contact fields are empty", () => {
    const lines = buildClientCardContactLines({
      phone: null,
      whatsapp: null,
      paymentTerms: null,
      country: null,
    });

    assert.deepEqual(lines, []);
  });

  it("does not produce separator artifacts for sparse fields", () => {
    const lines = buildClientCardContactLines({
      phone: null,
      whatsapp: "+962779504134",
      paymentTerms: null,
      country: null,
    });

    assert.deepEqual(lines, ["WhatsApp: +962779504134"]);
    assert.doesNotMatch(lines.join(" "), / · |undefined|null/);
  });
});

describe("ClientsCardView presentation wiring", () => {
  it("uses labeled contact helper and does not abbreviate WhatsApp as WA", () => {
    const src = readFileSync(CARD_VIEW, "utf8");
    assert.match(src, /buildClientCardContactLines/);
    assert.doesNotMatch(src, /\bWA:/);
  });
});
