import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/server";
import { sendReminderForInvoice } from "@/lib/reminders/send";

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
    const { user } = await requireWorkspace(workspaceId);

    const body = (await req.json()) as Partial<SendReminderPayload>;

    if (!body.invoiceId) {
      return NextResponse.json(
        { success: false, message: "Missing invoiceId" },
        { status: 400 }
      );
    }

    // Call shared reminder sending helper
    const result = await sendReminderForInvoice({
      workspaceId,
      invoiceId: body.invoiceId,
      ruleId: body.ruleId ?? null,
      templateId: body.templateId ?? null,
      source: "manual",
      userId: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.errorMessage || "Failed to send reminder",
        },
        { status: result.errorMessage?.includes("not found") ? 404 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || "Reminder sent successfully",
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

