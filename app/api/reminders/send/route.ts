import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { sendReminderForInvoice } from "@/lib/reminders/send";

type SendReminderPayload = {
  workspaceId: string;
  invoiceId: string;
  templateId?: string | null;
  ruleId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SendReminderPayload>;

    // Input validation
    if (!body.workspaceId || !body.invoiceId) {
      return NextResponse.json(
        {
          ok: false,
          message: "Missing required fields: workspaceId and invoiceId are required",
          details: {
            workspaceId: body.workspaceId ? undefined : "Missing",
            invoiceId: body.invoiceId ? undefined : "Missing",
          },
        },
        { status: 400 }
      );
    }

    const { workspaceId, invoiceId, templateId, ruleId } = body;

    // Validate workspaceId and invoiceId are valid UUIDs (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(workspaceId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid workspaceId format",
        },
        { status: 400 }
      );
    }

    if (!uuidRegex.test(invoiceId)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Invalid invoiceId format",
        },
        { status: 400 }
      );
    }

    // Validate recipient email if provided (for future use)
    // This check happens in sendReminderForInvoice but we can add it here too

    const { user } = await requireUser();

    // Call shared reminder sending helper
    // Reminders eligibility: clients must be active AND not archived
    // This rule must match all reminders queries globally.
    const result = await sendReminderForInvoice({
      workspaceId,
      invoiceId,
      templateId: templateId ?? null,
      ruleId: ruleId ?? null,
      source: "manual",
      userId: user.id ?? null,
    });

    // Return appropriate response based on status
    if (result.status === "skipped") {
      return NextResponse.json(
        {
          ok: false,
          status: "skipped",
          message: result.errorMessage || "Reminder skipped",
          reminder_log_id: result.reminderLogId,
          error: result.errorMessage || undefined,
          details: result.skipReason ? { skipReason: result.skipReason } : undefined,
        },
        { status: 200 } // 200 because it was handled correctly (skipped intentionally)
      );
    }

    if (!result.success) {
      // Determine appropriate status code based on error type
      const statusCode = result.errorMessage?.includes("not found")
        ? 404
        : 500;

      return NextResponse.json(
        {
          ok: false,
          status: result.status || "failed",
          message: result.errorMessage || "Failed to send reminder",
          reminder_log_id: result.reminderLogId,
          error: result.errorMessage || undefined,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        status: result.status || "sent",
        reminder_log_id: result.reminderLogId,
        message: result.message || "Reminder sent successfully",
      },
      { status: 200 }
    );
  } catch (err) {
    // Improved error logging
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error("[RemindersAPI] unexpected error:", {
      message: errorMessage,
      stack: errorStack,
      body: req.body,
    });

    return NextResponse.json(
      {
        ok: false,
        message: errorMessage || "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
