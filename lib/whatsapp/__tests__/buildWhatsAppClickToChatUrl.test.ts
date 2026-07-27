import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildWhatsAppClickToChatUrl,
  resolveInternationalWhatsAppDigits,
} from "@/lib/whatsapp/buildWhatsAppClickToChatUrl";

describe("buildWhatsAppClickToChatUrl", () => {
  const message = "Hello from Arrexia";

  it("A — normalizes +962779610078 to wa.me digits", () => {
    assert.equal(resolveInternationalWhatsAppDigits("+962779610078"), "962779610078");
    assert.equal(
      buildWhatsAppClickToChatUrl({ phone: "+962779610078", message }),
      "https://wa.me/962779610078?text=Hello%20from%20Arrexia"
    );
  });

  it("B — normalizes +1 (555) 123-4567", () => {
    assert.equal(resolveInternationalWhatsAppDigits("+1 (555) 123-4567"), "15551234567");
    assert.equal(
      buildWhatsAppClickToChatUrl({ phone: "+1 (555) 123-4567", message }),
      "https://wa.me/15551234567?text=Hello%20from%20Arrexia"
    );
  });

  it("C — strips spaces and hyphens from international numbers", () => {
    assert.equal(resolveInternationalWhatsAppDigits("+962 77-961-0078"), "962779610078");
  });

  it("D — rejects missing phone", () => {
    assert.equal(resolveInternationalWhatsAppDigits(null), null);
    assert.equal(resolveInternationalWhatsAppDigits(""), null);
    assert.equal(buildWhatsAppClickToChatUrl({ phone: null, message }), null);
  });

  it("E — rejects invalid or local-only phone values", () => {
    assert.equal(resolveInternationalWhatsAppDigits("779610078"), null);
    assert.equal(resolveInternationalWhatsAppDigits("0779610078"), null);
    assert.equal(resolveInternationalWhatsAppDigits("+123"), null);
    assert.equal(buildWhatsAppClickToChatUrl({ phone: "779610078", message }), null);
  });

  it("F — URL-encodes the message with encodeURIComponent", () => {
    const encoded = buildWhatsAppClickToChatUrl({
      phone: "+962779610078",
      message: "Hi there,\nLine 2 & special?",
    });
    assert.equal(
      encoded,
      "https://wa.me/962779610078?text=Hi%20there%2C%0ALine%202%20%26%20special%3F"
    );
  });
});
