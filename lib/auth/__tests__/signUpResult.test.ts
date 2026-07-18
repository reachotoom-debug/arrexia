import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthError, Session, User } from "@supabase/supabase-js";

import {
  analyzeSignUpResponse,
  shouldOfferSignupConfirmationResend,
  type SignUpResultData,
} from "../signUpResult";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

function buildSignUpData(overrides: Partial<SignUpResultData> = {}): SignUpResultData {
  return {
    user: null,
    session: null,
    ...overrides,
  };
}

describe("analyzeSignUpResponse", () => {
  it("Test 1 — new signup returns confirmation-required state", () => {
    const outcome = analyzeSignUpResponse(
      buildSignUpData({
        user: buildUser({ identities: [{ id: "identity-1" } as never] }),
        session: null,
      }),
      null
    );

    assert.equal(outcome.kind, "confirmation_sent");
    if (outcome.kind === "confirmation_sent") {
      assert.equal(outcome.email, "user@example.com");
    }
    assert.equal(shouldOfferSignupConfirmationResend(outcome), true);
  });

  it("Test 2 — existing account response does not offer resend confirmation", () => {
    const outcome = analyzeSignUpResponse(
      buildSignUpData({
        user: buildUser({ identities: [] }),
        session: null,
      }),
      null
    );

    assert.equal(outcome.kind, "already_registered");
    assert.equal(shouldOfferSignupConfirmationResend(outcome), false);
  });

  it("Test 3 — signup hard error returns safe error state", () => {
    const outcome = analyzeSignUpResponse(null, {
      message: "Database error saving new user",
      name: "AuthApiError",
      status: 500,
    } as AuthError);

    assert.equal(outcome.kind, "error");
    if (outcome.kind === "error") {
      assert.match(outcome.message, /database error/i);
    }
  });

  it("returns ready_to_sign_in when session is present", () => {
    const outcome = analyzeSignUpResponse(
      buildSignUpData({
        user: buildUser({
          identities: [{ id: "identity-1" } as never],
          email_confirmed_at: new Date().toISOString(),
        }),
        session: { access_token: "token" } as Session,
      }),
      null
    );

    assert.equal(outcome.kind, "ready_to_sign_in");
    assert.equal(shouldOfferSignupConfirmationResend(outcome), false);
  });
});
