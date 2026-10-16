import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceForApi } from "@/lib/auth/server";
import { sendReminderForInvoice } from "@/lib/reminders/send";

import { reminderDeliveryResponse } from "@/lib/reminders/deliveryResponse";

type SendReminderPayload = {
  invoiceId: string;
  templateId?: string | null;
  ruleId?: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const auth = await requireWorkspaceForApi(workspaceId);
    if (!auth.ok) return NextResponse.json({ ok: false, success: false, message: auth.error }, { status: auth.status });
    const { user, workspace } = auth;

    const body = (await req.json()) as Partial<SendReminderPayload>;

    if (!body.invoiceId) {
      return NextResponse.json(
        { success: false, message: "Missing invoiceId" },
        { status: 400 }
      );
    }

    // Call shared reminder sending helper
    const result = await sendReminderForInvoice({
      workspaceId: workspace.id,
      invoiceId: body.invoiceId,
      ruleId: body.ruleId ?? null,
      templateId: body.templateId ?? null,
      source: "manual",
      userId: user.id,
    });

    if (result.status === "skipped") {
      return NextResponse.json({
        ok: false,
        success: false,
        message: result.errorMessage || "Reminder skipped",
        ...reminderDeliveryResponse(result),
        error: result.errorMessage || undefined,
        details: result.skipReason ? { skipReason: result.skipReason } : undefined,
      }, { status: 200 });
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.errorMessage || "Failed to send reminder",
          ...reminderDeliveryResponse(result),
        },
        { status: result.errorMessage?.includes("not found") ? 404 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || "Reminder sent successfully",
      ...reminderDeliveryResponse(result),
    });
  } catch (err) {
    console.error("[SendReminderAPI] unexpected error", err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}

