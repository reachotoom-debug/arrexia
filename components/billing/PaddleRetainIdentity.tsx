"use client";

import { useEffect } from "react";
import type { Paddle } from "@paddle/paddle-js";
import { initializePaddleClient } from "@/lib/billing/paddle/initializePaddleClient";

// Paddle identity is global to the page, so only the latest effect may update it.
let identityOwner: symbol | null = null;
let identityPaddle: Paddle | null = null;
let appliedCustomerId: string | null | undefined;

function updateIdentity(paddle: Paddle, customerId: string | null): void {
  if (identityPaddle === paddle && appliedCustomerId === customerId) return;

  try {
    paddle.Update({ pwCustomer: customerId ? { id: customerId } : {} });
    identityPaddle = paddle;
    appliedCustomerId = customerId;
  } catch {
    // Retain must not interrupt the application or existing checkout handling.
    console.warn("Unable to update Paddle Retain identity.");
  }
}

export function PaddleRetainIdentity({ customerId }: { customerId: string | null }) {
  useEffect(() => {
    const owner = Symbol("paddle-retain-identity");
    identityOwner = owner;

    const releaseIdentity = () => {
      if (identityOwner !== owner) return;
      identityOwner = null;
      if (identityPaddle) updateIdentity(identityPaddle, null);
    };

    void initializePaddleClient().then((result) => {
      // Ignore initialization that finishes after cleanup or replacement.
      if (identityOwner !== owner || !result.ok) return;
      updateIdentity(result.paddle, customerId);
    }).catch(() => {
      console.warn("Unable to initialize Paddle Retain identity.");
    });

    return releaseIdentity;
  }, [customerId]);

  return null;
}
