import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getClientPhone,
  getClientWhatsApp,
  resolveClientWhatsAppPhone,
} from "@/lib/clients/clientContact";

describe("clientContact V1 contract", () => {
  it("A — phone only: display phone, WhatsApp action disabled", () => {
    const client = { whatsapp: "49301234567", whatsapp_phone: null };
    assert.equal(getClientPhone(client), "49301234567");
    assert.equal(getClientWhatsApp(client), null);
    assert.equal(resolveClientWhatsAppPhone(client.whatsapp_phone), null);
  });

  it("B — WhatsApp only: action uses whatsapp_phone", () => {
    const client = { whatsapp: null, whatsapp_phone: "+962795556789" };
    assert.equal(getClientPhone(client), null);
    assert.equal(getClientWhatsApp(client), "+962795556789");
    assert.equal(resolveClientWhatsAppPhone(client.whatsapp_phone), "+962795556789");
  });

  it("C — both: separate display, action uses WhatsApp only", () => {
    const client = {
      whatsapp: "+96265551234",
      whatsapp_phone: "+962795556789",
    };
    assert.equal(getClientPhone(client), "+96265551234");
    assert.equal(getClientWhatsApp(client), "+962795556789");
    assert.equal(resolveClientWhatsAppPhone(client.whatsapp_phone), "+962795556789");
  });

  it("D — neither: valid client contact fields", () => {
    const client = { whatsapp: null, whatsapp_phone: null };
    assert.equal(getClientPhone(client), null);
    assert.equal(getClientWhatsApp(client), null);
    assert.equal(resolveClientWhatsAppPhone(client.whatsapp_phone), null);
  });

  it("does not fall back Phone to WhatsApp actions (Ola regression)", () => {
    assert.equal(resolveClientWhatsAppPhone(undefined), null);
    assert.equal(resolveClientWhatsAppPhone("   "), null);
  });
});
