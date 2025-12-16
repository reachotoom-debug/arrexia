type SupabaseClientLike = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => {
        order: (column: string, options?: { ascending?: boolean }) => {
          limit: (count: number) => Promise<{ data: Array<{ invoice_number: string | null }> | null; error: unknown }>;
        };
      };
    };
  };
};

/**
 * Generate next invoice number in format INV-0001, INV-0002, ...
 * Scoped per organization_id.
 */
export async function generateNextInvoiceNumber(
  supabase: SupabaseClientLike,
  organizationId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("organization_id", organizationId)
    .order("invoice_number", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return "INV-0001";
  }

  const lastNumber: string = data[0].invoice_number || "INV-0000";

  const match = lastNumber.match(/^INV-(\d{4})$/);
  if (!match) return "INV-0001";

  const current = parseInt(match[1], 10);
  const next = current + 1;
  return `INV-${next.toString().padStart(4, "0")}`;
}

