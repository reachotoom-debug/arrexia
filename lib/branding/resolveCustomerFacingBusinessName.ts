/** Default workspace names that should not appear in customer-facing copy. */
const PLACEHOLDER_WORKSPACE_NAMES = new Set(["my workspace", "workspace"]);

export type CustomerFacingBusinessNameInput = {
  brandingBusinessLegalName?: string | null;
  businessName?: string | null;
  workspaceDisplayName?: string | null;
  workspaceName?: string | null;
};

/**
 * Customer-facing business name — aligned with invoice PDF/email sender priority
 * (`buildInvoiceBranding` / `getInvoiceSenderDisplay`), with a meaningful workspace
 * name fallback before the generic label.
 */
export function resolveCustomerFacingBusinessName(
  input: CustomerFacingBusinessNameInput
): string {
  const legal = input.brandingBusinessLegalName?.trim();
  if (legal) return legal;

  const business = input.businessName?.trim();
  if (business) return business;

  const display = input.workspaceDisplayName?.trim();
  if (display) return display;

  const workspace = input.workspaceName?.trim();
  if (workspace && !PLACEHOLDER_WORKSPACE_NAMES.has(workspace.toLowerCase())) {
    return workspace;
  }

  return "Your company";
}
