import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCountryOptions,
  filterCountries,
} from "@/lib/clients/countrySelectFilter";
import { countries } from "@/lib/utils/countries";

describe("country select filter", () => {
  it("F — jor filters to Jordan", () => {
    const filtered = filterCountries(countries, "jor");
    assert.deepEqual(
      filtered.map((c) => c.name),
      ["Jordan"]
    );
  });

  it("G — fra filters to France", () => {
    const filtered = filterCountries(countries, "fra");
    assert.ok(filtered.some((c) => c.name === "France"));
    assert.equal(filtered[0]?.name, "France");
  });

  it("H — calling-code search +962 finds Jordan", () => {
    const filtered = filterCountries(countries, "+962");
    assert.ok(filtered.some((c) => c.name === "Jordan"));
  });

  it("K — existing selected country remains in options when unknown historically", () => {
    const options = buildCountryOptions("Legacy Country Name");
    assert.ok(options.some((c) => c.name === "Legacy Country Name"));
    assert.ok(options.some((c) => c.name === "Jordan"));
  });

  it("known country does not duplicate options", () => {
    const options = buildCountryOptions("Jordan");
    const jordanCount = options.filter((c) => c.name === "Jordan").length;
    assert.equal(jordanCount, 1);
  });
});
