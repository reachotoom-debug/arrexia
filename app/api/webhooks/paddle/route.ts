import { handlePaddleWebhookRequest } from "@/lib/billing/paddle/webhook/handlePaddleWebhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature");
  const rawBody = await request.text();

  const result = await handlePaddleWebhookRequest({
    rawBody,
    signature,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json(
    { received: true, duplicate: result.duplicate, result: result.result },
    { status: 200 }
  );
}
