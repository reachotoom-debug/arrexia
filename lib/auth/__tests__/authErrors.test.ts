import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTH_EMAIL_NOT_CONFIRMED_MESSAGE,
  AUTH_INVALID_CREDENTIALS_MESSAGE,
  AUTH_CONFIRMATION_LINK_INVALID_MESSAGE,
  mapAuthCallbackExchangeError,
  mapSupabaseAuthError,
} from "../authErrors";

describe("mapSupabaseAuthError", () => {
  it("Test 8 — maps invalid credentials for login", () => {
    assert.equal(
      mapSupabaseAuthError("Invalid login credentials", "login"),
      AUTH_INVALID_CREDENTIALS_MESSAGE
    );
  });

  it("maps unconfirmed email before generic login fallback", () => {
    assert.equal(
      mapSupabaseAuthError("Email not confirmed", "login"),
      AUTH_EMAIL_NOT_CONFIRMED_MESSAGE
    );
  });
});

describe("mapAuthCallbackExchangeError", () => {
  it("Test 6 — maps expired confirmation links to safe copy", () => {
    assert.equal(
      mapAuthCallbackExchangeError("Email link is invalid or has expired"),
      AUTH_CONFIRMATION_LINK_INVALID_MESSAGE
    );
  });
});
