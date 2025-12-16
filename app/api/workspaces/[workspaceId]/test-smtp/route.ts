import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace, requireUser } from "@/lib/auth/server";
import { emailSettingsSchema } from "@/lib/schemas/email-settings";

// Dynamic import for nodemailer (install with: npm install nodemailer @types/nodemailer)
let nodemailer: typeof import("nodemailer");

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(
  request: NextRequest,
  routeParams: RouteParams
) {
  try {
    const { workspaceId } = await routeParams.params;
    
    // Ensure user is authenticated and has access to workspace
    const { user } = await requireUser();
    await requireWorkspace(workspaceId);

    // Dynamically import nodemailer
    try {
      nodemailer = await import("nodemailer");
    } catch (importError) {
      return NextResponse.json(
        {
          error: "nodemailer package is not installed. Please install it with: npm install nodemailer @types/nodemailer",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    
    // Validate the email settings
    const validatedData = emailSettingsSchema.parse(body);

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: validatedData.smtp_host,
      port: validatedData.smtp_port,
      secure: validatedData.use_tls, // true for 465, false for other ports
      auth: {
        user: validatedData.smtp_username,
        pass: validatedData.smtp_password,
      },
    });

    // Verify connection
    await transporter.verify();

    // Get current user's email for test email
    const testEmail = user.email || validatedData.from_email;

    // Send test email
    const info = await transporter.sendMail({
      from: `"${validatedData.from_name}" <${validatedData.from_email}>`,
      to: testEmail,
      subject: "SMTP Test - FlowCollect",
      text: "This is a test email from FlowCollect to verify your SMTP settings are configured correctly.",
      html: "<p>This is a test email from FlowCollect to verify your SMTP settings are configured correctly.</p>",
    });

    return NextResponse.json({
      success: true,
      message: "SMTP test succeeded. Test email sent successfully.",
      messageId: info.messageId,
    });
  } catch (error) {
    console.error("[test-smtp] Error:", error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to test SMTP connection",
      },
      { status: 500 }
    );
  }
}

