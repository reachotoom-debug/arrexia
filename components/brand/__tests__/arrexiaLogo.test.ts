import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLogoStyle } from "@/components/brand/ArrexiaLogo";
import { ARREXIA_BRAND } from "@/lib/brand/assets";

describe("ArrexiaLogo sizing", () => {
  it("preserves full-logo aspect ratio when height is CSS-controlled", () => {
    const style = buildLogoStyle("light", 76, "block h-14 w-auto sm:h-[3.75rem] lg:h-16");

    assert.equal(style.aspectRatio, "1774 / 887");
    assert.equal(style.width, "auto");
    assert.equal(style.maxWidth, "100%");
    assert.equal(style.objectFit, "contain");
  });

  it("does not treat w-auto as explicit width control", () => {
    const style = buildLogoStyle("light", 76, "h-14 w-auto");

    assert.equal(style.aspectRatio, "1774 / 887");
    assert.equal(style.height, undefined);
  });

  it("uses height auto when an explicit width class is provided", () => {
    const style = buildLogoStyle("icon", 48, "w-12");

    assert.equal(style.height, "auto");
    assert.equal(style.width, undefined);
    assert.equal(style.aspectRatio, undefined);
  });

  it("keeps the canonical light logo asset path", () => {
    assert.equal(ARREXIA_BRAND.logoLight, "/brand/arrexia-logo-light.png");
  });
});
