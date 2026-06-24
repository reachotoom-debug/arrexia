/**
 * Centralized settings loader for workspace settings
 * Consolidates data from workspaces, settings, and workspace_email_settings tables
 */

import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { resolveEmailProvider } from "@/lib/email/sendEmail";

export type WorkspaceSettings = {
  workspace: {
    id: string;
    name: string;
    logoUrl: string | null;
    phone: string | null;
    country: string | null;
    taxNumber: string | null;
    email: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  email: {
    provider: "resend" | "smtp";
    fromName: string;
    fromEmail: string;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUser: string | null;
    smtpPasswordSet: boolean; // mask actual password
    smtpUseTls: boolean | null;
  };
  reminders: {
    enableAutomatic: boolean;
    afterDueDays: number;
    beforeDueDays: number;
    defaultChannel: "email" | "whatsapp";
  };
  payments: {
    defaultCurrency: string; // ISO code like "USD"
    defaultPaymentTermsDays: number;
  };
  branding: {
    logoUrl: string | null;
    businessName: string | null;
    businessLegalName: string | null;
    businessAddress: string | null;
    businessEmail: string | null;
    businessPhone: string | null;
    website: string | null;
    taxId: string | null;
  };
  paymentDetails: {
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankSwift: string | null;
    bankIban: string | null;
    paypalHandle: string | null;
    stripeDescriptor: string | null;
    otherInstructions: string | null;
  };
  invoice: {
    thankYouNote: string | null;
  };
  timezone: string | null;
};

/**
 * Load all workspace settings in a normalized, typed format
 */
export async function loadWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettings> {
  // Validate workspace access - this is the authority that workspace exists and is accessible
  const { workspace: validatedWorkspace } = await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Load all settings in parallel
  const [workspaceResult, settingsResult, emailSettingsResult] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, profile_image_url")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_email_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);

  const workspace = workspaceResult.data;
  const settings = settingsResult.data;
  const emailSettings = emailSettingsResult.data;

  // Log error if workspace query failed
  if (workspaceResult.error) {
    console.error("[loadWorkspaceSettings] workspace load error:", workspaceResult.error);
  }

  // If workspace row is missing, log warning and use defaults
  if (!workspace) {
    console.warn("[loadWorkspaceSettings] workspace row missing for", workspaceId, "- using defaults");
  }

  // Use workspace from query if available, otherwise fall back to defaults
  const workspaceSafe = workspace ?? {
    id: workspaceId,
    name: "Workspace",
    profile_image_url: null,
  };

  // Normalize workspace data from settings table
  const workspaceData = {
    id: workspaceSafe.id,
    name: settings?.workspace_display_name ?? workspaceSafe.name ?? "Workspace",
    logoUrl: settings?.workspace_logo_url ?? workspaceSafe.profile_image_url ?? settings?.logo_url ?? null,
    phone: settings?.business_phone ?? null,
    country: settings?.business_country ?? null,
    taxNumber: settings?.business_tax_number ?? null,
    email: settings?.business_email ?? null,
    website: settings?.business_website ?? null,
    addressLine1: settings?.business_address_line1 ?? null,
    addressLine2: settings?.business_address_line2 ?? null,
    city: settings?.business_city ?? null,
    state: settings?.business_state ?? null,
    postalCode: settings?.business_postal_code ?? null,
  };

  // Normalize email settings
  const emailProvider = resolveEmailProvider(settings?.email_provider);
  const emailData = {
    provider: emailProvider,
    fromName: emailSettings?.from_name || settings?.from_name || "",
    fromEmail: emailSettings?.from_email || settings?.from_email || "",
    smtpHost: emailSettings?.smtp_host || null,
    smtpPort: emailSettings?.smtp_port || null,
    smtpUser: emailSettings?.smtp_username || null,
    smtpPasswordSet: !!(emailSettings?.smtp_password),
    smtpUseTls: emailSettings?.use_tls ?? true,
  };

  // Normalize reminder settings
  const reminderChannel = settings?.reminder_channel;
  const normalizedChannel: "email" | "whatsapp" = reminderChannel === "whatsapp" ? "whatsapp" : "email";
  const remindersData = {
    enableAutomatic: settings?.auto_send_reminders ?? false,
    afterDueDays: settings?.reminder_after_days ?? 7,
    beforeDueDays: settings?.reminder_before_days ?? 3,
    defaultChannel: normalizedChannel,
  };

  // Normalize payment settings
  const paymentsData = {
    defaultCurrency: settings?.default_currency || "USD",
    defaultPaymentTermsDays: settings?.default_due_days || 30,
  };

  const brandingData = {
    logoUrl: settings?.workspace_logo_url ?? settings?.logo_url ?? workspaceSafe.profile_image_url ?? null,
    businessName: settings?.workspace_display_name ?? workspaceSafe.name ?? null,
    businessLegalName: settings?.branding_business_legal_name ?? null,
    businessAddress: settings?.branding_business_address ?? null,
    businessEmail: settings?.business_email ?? null,
    businessPhone: settings?.business_phone ?? null,
    website: settings?.business_website ?? null,
    taxId: settings?.branding_tax_id ?? settings?.business_tax_number ?? null,
  };

  const paymentDetailsData = {
    bankName: settings?.payment_bank_name ?? null,
    bankAccountName: settings?.payment_bank_account_name ?? null,
    bankAccountNumber: settings?.payment_bank_account_number ?? null,
    bankSwift: settings?.payment_bank_swift ?? null,
    bankIban: settings?.payment_bank_iban ?? null,
    paypalHandle: settings?.payment_paypal_handle ?? null,
    stripeDescriptor: settings?.payment_stripe_descriptor ?? null,
    otherInstructions: settings?.payment_other_instructions ?? null,
  };

  const invoiceData = {
    thankYouNote: settings?.invoice_thank_you_note ?? null,
  };

  const timezone = settings?.timezone ?? null;

  return {
    workspace: workspaceData,
    email: emailData,
    reminders: remindersData,
    payments: paymentsData,
    branding: brandingData,
    paymentDetails: paymentDetailsData,
    invoice: invoiceData,
    timezone,
  };
}
