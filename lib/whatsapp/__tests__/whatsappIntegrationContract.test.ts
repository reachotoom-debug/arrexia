import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const DAILY_ACTION_CELL = "app/[workspaceId]/actions/_components/CollectionActionCell.tsx";
const COLLECTIONS_PAGE = "app/[workspaceId]/collections/page.tsx";
const COLLECTIONS_TABLE = "app/[workspaceId]/collections/_components/CollectionsTable.tsx";
const DAILY_ACTION_LOADER = "lib/actions/getDailyActionCenterData.ts";

describe("WhatsApp integration contract", () => {
  it("Daily Action Center uses shared WhatsAppCollectionLink", () => {
    const src = readFileSync(DAILY_ACTION_CELL, "utf8");
    assert.match(src, /WhatsAppCollectionLink/);
    assert.match(src, /buildCollectionWhatsAppMessage|clientPhone/);
    assert.doesNotMatch(src, /wa\.me/);
  });

  it("Collections page uses shared WhatsAppCollectionLink", () => {
    const pageSrc = readFileSync(COLLECTIONS_PAGE, "utf8");
    const tableSrc = readFileSync(COLLECTIONS_TABLE, "utf8");

    assert.match(pageSrc, /WhatsAppCollectionLink/);
    assert.match(tableSrc, /WhatsAppCollectionLink/);
    assert.doesNotMatch(pageSrc, /wa\.me/);
    assert.doesNotMatch(tableSrc, /wa\.me/);
  });

  it("Daily Action Center batch-loads client WhatsApp fields", () => {
    const src = readFileSync(DAILY_ACTION_LOADER, "utf8");
    assert.match(src, /whatsapp_phone,\s*whatsapp/);
    assert.match(src, /resolveClientWhatsAppPhone/);
    assert.match(src, /clientPhone/);
  });
});
