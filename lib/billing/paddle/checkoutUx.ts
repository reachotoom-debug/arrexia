export const PADDLE_CHECKOUT_SUCCESS_MESSAGE =
  "Payment received. Your subscription will activate after confirmation.";

export const PADDLE_CHECKOUT_OPENED_MESSAGE = "Checkout opened.";

export const PADDLE_CHECKOUT_CLOSED_MESSAGE = "Checkout closed.";

export const PADDLE_CHECKOUT_ERROR_MESSAGE =
  "Checkout could not be completed. Please try again or contact support.";

export type PaddleCheckoutUxPhase = "opened" | "completed" | "closed" | "error";

/** Maps Paddle.js checkout event names to UX phases. */
export function mapPaddleCheckoutUxPhase(eventName: string): PaddleCheckoutUxPhase | null {
  switch (eventName) {
    case "checkout.loaded":
      return "opened";
    case "checkout.completed":
      return "completed";
    case "checkout.closed":
      return "closed";
    case "checkout.error":
    case "checkout.failed":
    case "checkout.payment.failed":
    case "checkout.payment.error":
      return "error";
    default:
      return null;
  }
}

export function getPaddleCheckoutUxMessage(phase: PaddleCheckoutUxPhase): string {
  switch (phase) {
    case "opened":
      return PADDLE_CHECKOUT_OPENED_MESSAGE;
    case "completed":
      return PADDLE_CHECKOUT_SUCCESS_MESSAGE;
    case "closed":
      return PADDLE_CHECKOUT_CLOSED_MESSAGE;
    case "error":
      return PADDLE_CHECKOUT_ERROR_MESSAGE;
    default:
      return PADDLE_CHECKOUT_ERROR_MESSAGE;
  }
}
