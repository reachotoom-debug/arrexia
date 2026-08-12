import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const ACTIONS_PATH = "app/[workspaceId]/clients/actions.ts";
const FORM_PATH = "app/[workspaceId]/clients/_components/ClientForm.tsx";
const COUNTRY_SELECT_PATH =
  "app/[workspaceId]/clients/_components/SearchableCountrySelect.tsx";

describe("client edit fix — WhatsApp collision UX", () => {
  it("A/D — create/update map WhatsApp unique violation to fieldErrors", () => {
    const src = readFileSync(ACTIONS_PATH, "utf8");
    assert.match(src, /mapClientPersistenceError\(error\)/);
    assert.match(src, /clientFieldErrorResult\(mapped\.fieldErrors\)/);
    assert.match(src, /logPostgresUniqueViolation\("createClient"/);
    assert.match(src, /logPostgresUniqueViolation\("updateClient"/);
  });

  it("B — ClientForm surfaces WhatsApp field error without destructive toast", () => {
    const src = readFileSync(FORM_PATH, "utf8");
    assert.match(src, /result\.fieldErrors\?\.whatsapp/);
    assert.match(src, /setError\("whatsapp"/);
    assert.match(src, /errors\.whatsapp\?\.message/);
    const whatsappBlock = src.slice(
      src.indexOf("result.fieldErrors?.whatsapp"),
      src.indexOf("result.fieldErrors?.email")
    );
    assert.doesNotMatch(whatsappBlock, /toast\(/);
  });

  it("C — duplicate Phone remains allowed (no phone unique mapping)", () => {
    const actionsSrc = readFileSync(ACTIONS_PATH, "utf8");
    assert.match(actionsSrc, /whatsapp: parsed\.phone/);
    assert.doesNotMatch(actionsSrc, /clients_workspace_phone_unique/);
    assert.doesNotMatch(actionsSrc, /fieldErrors\.phone/);
  });
});

describe("client edit fix — country searchable combobox", () => {
  const src = readFileSync(COUNTRY_SELECT_PATH, "utf8");

  it("I — Arrow keys and Enter select are implemented", () => {
    assert.match(src, /event\.key === "ArrowDown"/);
    assert.match(src, /event\.key === "ArrowUp"/);
    assert.match(src, /event\.key === "Enter"/);
    assert.match(src, /selectCountry\(country\.name\)/);
  });

  it("J — Escape closes the list", () => {
    assert.match(src, /event\.key === "Escape"/);
    assert.match(src, /setOpen\(false\)/);
  });

  it("K — selected country shown when closed via placeholder", () => {
    assert.match(src, /placeholder=\{placeholder\}/);
    assert.match(src, /countryLabel\(selected\)/);
    assert.match(src, /const inputValue = open \? query : ""/);
  });

  it("typing opens list and filters immediately", () => {
    assert.match(src, /role="combobox"/);
    assert.match(src, /onFocus=\{handleInputFocus\}/);
    assert.match(src, /handleInputChange/);
    assert.match(src, /filterCountries\(options, query\)/);
    assert.match(src, /event\.key\.length === 1/);
  });

  it("accessibility — aria-expanded, aria-controls, aria-selected", () => {
    assert.match(src, /aria-expanded=\{open\}/);
    assert.match(src, /aria-controls=\{listboxId\}/);
    assert.match(src, /aria-selected=\{isSelected\}/);
  });
});
