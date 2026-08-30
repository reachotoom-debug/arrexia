import "server-only";

/** @internal Dev/test-only signature diagnostics — not used in the webhook request path. */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getPaddleWebhooksVerifier } from "./paddleWebhooksVerifier";

/** Matches @paddle/paddle-node-sdk WebhooksValidator.MAX_VALID_TIME_DIFFERENCE (seconds). */
export const PADDLE_SDK_SIGNATURE_TOLERANCE_SECONDS = 5;

export type ParsedPaddleSignatureHeader = {
  ts: number | null;
  h1Count: number;
};

export type PaddleWebhookSignatureDiagnostics = {
  signature: ParsedPaddleSignatureHeader & {
    currentUnixTimestamp: number;
    ageSeconds: number | null;
    exceedsSdkTolerance: boolean;
    sdkToleranceSeconds: number;
  };
  secret: {
    secretLength: number;
    secretPrefixValid: boolean;
    secretHasLeadingOrTrailingWhitespace: boolean;
  };
  body: {
    rawBodyByteLength: number;
    rawBodySha256: string;
  };
  manualVerification: {
    manualSignatureMatch: boolean;
    matchingH1Index: number | null;
    manualTimestampWithinSdkTolerance: boolean;
  };
  sdkVerification: {
    sdkIsSignatureValid: boolean;
    sdkUnmarshalSucceeded: boolean;
    sdkErrorName?: string;
    sdkErrorMessage?: string;
  };
};

/** Parses Paddle-Signature without exposing h1 values. */
export function parsePaddleSignatureHeader(signature: string): ParsedPaddleSignatureHeader {
  const parts = signature.split(";");
  let ts: number | null = null;
  let h1Count = 0;

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === "ts") {
      const parsedTs = Number.parseInt(value, 10);
      ts = Number.isFinite(parsedTs) ? parsedTs : null;
    } else if (key === "h1") {
      h1Count += 1;
    }
  }

  return { ts, h1Count };
}

function extractH1Values(signature: string): string[] {
  const values: string[] = [];

  for (const part of signature.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === "h1" && value) {
      values.push(value);
    }
  }

  return values;
}

function timingSafeEqualHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function isWithinSdkTolerance(ts: number, nowMs: number): boolean {
  return nowMs <= (ts + PADDLE_SDK_SIGNATURE_TOLERANCE_SECONDS) * 1000;
}

function readSecretWhitespace(rawEnvSecret: string | undefined): boolean {
  if (rawEnvSecret === undefined) {
    return false;
  }
  return rawEnvSecret !== rawEnvSecret.trim();
}

/** Dev-only independent HMAC verification mirroring Paddle's signed payload format. */
export function verifyPaddleWebhookSignatureManually(input: {
  rawBody: string;
  signature: string;
  secret: string;
  nowMs?: number;
}): {
  manualSignatureMatch: boolean;
  matchingH1Index: number | null;
  manualTimestampWithinSdkTolerance: boolean;
  ts: number | null;
  ageSeconds: number | null;
} {
  const nowMs = input.nowMs ?? Date.now();
  const parsed = parsePaddleSignatureHeader(input.signature);
  const h1Values = extractH1Values(input.signature);

  if (parsed.ts === null || h1Values.length === 0) {
    return {
      manualSignatureMatch: false,
      matchingH1Index: null,
      manualTimestampWithinSdkTolerance: false,
      ts: parsed.ts,
      ageSeconds: null,
    };
  }

  const signedPayload = `${parsed.ts}:${input.rawBody}`;
  const computedHmac = createHmac("sha256", input.secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  let matchingH1Index: number | null = null;
  for (let index = 0; index < h1Values.length; index += 1) {
    if (timingSafeEqualHex(computedHmac, h1Values[index]!)) {
      matchingH1Index = index;
      break;
    }
  }

  const ageSeconds = Math.max(0, Math.floor(nowMs / 1000) - parsed.ts);

  return {
    manualSignatureMatch: matchingH1Index !== null,
    matchingH1Index,
    manualTimestampWithinSdkTolerance: isWithinSdkTolerance(parsed.ts, nowMs),
    ts: parsed.ts,
    ageSeconds,
  };
}

export async function diagnosePaddleWebhookSignature(input: {
  rawBody: string;
  signature: string;
  secret: string;
  rawEnvSecret?: string;
  nowMs?: number;
}): Promise<PaddleWebhookSignatureDiagnostics> {
  const nowMs = input.nowMs ?? Date.now();
  const currentUnixTimestamp = Math.floor(nowMs / 1000);
  const parsed = parsePaddleSignatureHeader(input.signature);
  const manual = verifyPaddleWebhookSignatureManually({
    rawBody: input.rawBody,
    signature: input.signature,
    secret: input.secret,
    nowMs,
  });

  const webhooks = getPaddleWebhooksVerifier();
  let sdkIsSignatureValid = false;
  let sdkUnmarshalSucceeded = false;
  let sdkErrorName: string | undefined;
  let sdkErrorMessage: string | undefined;

  try {
    sdkIsSignatureValid = await webhooks.isSignatureValid(
      input.rawBody,
      input.secret,
      input.signature
    );
  } catch (error) {
    sdkErrorName = error instanceof Error ? error.name : "Error";
    sdkErrorMessage = error instanceof Error ? error.message : "SDK isSignatureValid failed.";
  }

  if (sdkIsSignatureValid) {
    try {
      await webhooks.unmarshal(input.rawBody, input.secret, input.signature);
      sdkUnmarshalSucceeded = true;
    } catch (error) {
      sdkErrorName = error instanceof Error ? error.name : "Error";
      sdkErrorMessage = error instanceof Error ? error.message : "SDK unmarshal failed.";
    }
  }

  const ageSeconds =
    manual.ageSeconds ??
    (parsed.ts === null ? null : Math.max(0, currentUnixTimestamp - parsed.ts));

  return {
    signature: {
      ts: parsed.ts,
      h1Count: parsed.h1Count,
      currentUnixTimestamp,
      ageSeconds,
      exceedsSdkTolerance:
        parsed.ts === null ? false : !isWithinSdkTolerance(parsed.ts, nowMs),
      sdkToleranceSeconds: PADDLE_SDK_SIGNATURE_TOLERANCE_SECONDS,
    },
    secret: {
      secretLength: input.secret.length,
      secretPrefixValid: input.secret.startsWith("pdl_ntfset_"),
      secretHasLeadingOrTrailingWhitespace: readSecretWhitespace(input.rawEnvSecret),
    },
    body: {
      rawBodyByteLength: Buffer.byteLength(input.rawBody, "utf8"),
      rawBodySha256: createHash("sha256").update(input.rawBody, "utf8").digest("hex"),
    },
    manualVerification: {
      manualSignatureMatch: manual.manualSignatureMatch,
      matchingH1Index: manual.matchingH1Index,
      manualTimestampWithinSdkTolerance: manual.manualTimestampWithinSdkTolerance,
    },
    sdkVerification: {
      sdkIsSignatureValid,
      sdkUnmarshalSucceeded,
      sdkErrorName,
      sdkErrorMessage,
    },
  };
}
