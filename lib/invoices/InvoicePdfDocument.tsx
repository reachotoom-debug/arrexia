import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/format/currency";
import { getInvoiceStatusLabel } from "./status-ui";
import type { PrintableInvoice } from "./invoice-pdf-shared";
import {
  formatInvoiceDate,
  formatPdfFromLocationLine,
  resolveThankYouBody,
  resolvePaymentInstructionLines,
  companyInitials,
  buildHeaderContactLine,
} from "./invoice-pdf-shared";

const NAVY = "#0b1f3a";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#64748b";
const BORDER = "#e5e7eb";
const SOFT_BG = "#f8fafc";
const ACCENT_SOFT = "#eef2ff";
const ROW_DIVIDER = "#eef2f7";
const SUCCESS = "#059669";
const DANGER = "#dc2626";

function statusBadgeColors(status: string): { bg: string; text: string } {
  switch (status.toLowerCase()) {
    case "draft":
      return { bg: "#f3f4f6", text: "#374151" };
    case "sent":
      return { bg: "#e0e7ff", text: NAVY };
    case "partially_paid":
      return { bg: "#fef3c7", text: "#92400e" };
    case "paid":
      return { bg: "#dcfce7", text: "#14532d" };
    case "overdue":
      return { bg: "#fee2e2", text: "#991b1b" };
    case "void":
      return { bg: "#f3f4f6", text: "#6b7280" };
    default:
      return { bg: "#e0e7ff", text: NAVY };
  }
}

function paymentMethodLabel(
  pd: PrintableInvoice["paymentDetails"]
): string | null {
  if (!pd) return null;
  const hasBank =
    pd.bankName ||
    pd.bankAccountName ||
    pd.bankAccountNumber ||
    pd.bankSwift ||
    pd.bankIban;
  if (hasBank) return "Bank transfer";
  if (pd.paypalHandle?.trim()) return "PayPal";
  if (pd.stripeDescriptor?.trim()) return "Card / Stripe";
  return null;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 11,
    color: TEXT_PRIMARY,
    backgroundColor: "#ffffff",
    paddingTop: 20,
    paddingHorizontal: 40,
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  companyBlock: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "58%",
  },
  logoImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 8,
    objectFit: "contain",
  },
  initialsBox: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAVY,
  },
  initialsText: {
    fontSize: 11,
    fontWeight: 700,
    color: "#ffffff",
  },
  companyName: {
    fontSize: 13,
    fontWeight: 700,
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  contactLine: {
    fontSize: 9,
    color: TEXT_SECONDARY,
  },
  metaPanel: {
    width: 130,
    alignItems: "flex-end",
  },
  metaRow: {
    marginBottom: 6,
    alignItems: "flex-end",
  },
  metaLabel: {
    fontSize: 7.5,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 10,
    fontWeight: 600,
    color: TEXT_PRIMARY,
  },
  titleBlock: {
    marginTop: 2,
    marginBottom: 10,
  },
  invoiceWord: {
    fontSize: 40,
    fontWeight: 700,
    color: NAVY,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  invoiceMetaRow: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  invoiceNumber: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginBottom: 6,
  },
  statusPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.2,
  },
  cardsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  addressCard: {
    width: "48.5%",
  },
  cardLabel: {
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 7,
    color: NAVY,
  },
  cardName: {
    fontSize: 11,
    fontWeight: 700,
    color: TEXT_PRIMARY,
    marginBottom: 3,
  },
  cardLine: {
    fontSize: 10,
    color: TEXT_SECONDARY,
    lineHeight: 1.35,
    marginBottom: 1,
  },
  lineItemsCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    color: NAVY,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 0,
  },
  thText: {
    fontSize: 8.5,
    fontWeight: 700,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: ROW_DIVIDER,
  },
  colDesc: { width: "52%", paddingRight: 6 },
  colQty: { width: "12%", textAlign: "right" as const },
  colUnit: { width: "18%", textAlign: "right" as const },
  colAmt: { width: "18%", textAlign: "right" as const },
  itemName: {
    fontSize: 10.5,
    fontWeight: 600,
    color: TEXT_PRIMARY,
  },
  itemDesc: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginTop: 1,
  },
  cellText: {
    fontSize: 10.5,
    color: TEXT_PRIMARY,
  },
  totalsWrap: {
    alignItems: "flex-end",
    marginTop: 8,
    paddingTop: 4,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
  totalValue: {
    fontSize: 11,
    color: TEXT_PRIMARY,
    textAlign: "right",
  },
  discountValue: {
    fontSize: 11,
    color: DANGER,
    textAlign: "right",
  },
  emphasisLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: NAVY,
  },
  emphasisValue: {
    fontSize: 11,
    fontWeight: 700,
    color: NAVY,
    textAlign: "right",
  },
  emphasisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
    marginTop: 2,
    marginBottom: 4,
    backgroundColor: ACCENT_SOFT,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  paidRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 250,
    marginBottom: 4,
  },
  paidValue: {
    fontSize: 11,
    color: SUCCESS,
    fontWeight: 600,
    textAlign: "right",
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  bottomCard: {
    width: "48.5%",
  },
  bottomCardFull: {
    width: "100%",
  },
  methodText: {
    fontSize: 10,
    fontWeight: 600,
    color: TEXT_PRIMARY,
    marginBottom: 4,
  },
  payRow: {
    marginBottom: 2,
  },
  payLine: {
    fontSize: 9.5,
    lineHeight: 1.3,
    color: TEXT_SECONDARY,
  },
  payKey: {
    fontWeight: 600,
    color: TEXT_PRIMARY,
  },
  instructionText: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginTop: 4,
    lineHeight: 1.3,
  },
  noteText: {
    fontSize: 10,
    color: TEXT_SECONDARY,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: SOFT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: "solid",
  },
  footerColLeft: {
    width: "50%",
  },
  footerColRight: {
    width: "50%",
    alignItems: "flex-end",
  },
  footerLeftText: {
    fontSize: 9.5,
    color: TEXT_MUTED,
  },
  footerBrand: {
    fontSize: 9.5,
    fontWeight: 700,
    color: NAVY,
  },
  footerRight: {
    fontSize: 9.5,
    color: TEXT_MUTED,
    textAlign: "right",
  },
});

export type InvoicePdfDocumentProps = {
  invoice: PrintableInvoice;
  logoSrc: string | null;
};

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function AddressCard({
  label,
  name,
  lines,
}: {
  label: string;
  name: string;
  lines: string[];
}) {
  return (
    <View style={[styles.card, styles.addressCard]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardName}>{name}</Text>
      {lines.map((line, i) => (
        <Text key={`${label}-${i}`} style={styles.cardLine}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** FROM block: email, phone, website, city-country only (no tax ID or street address). */
function buildFromLines(invoice: PrintableInvoice): string[] {
  const lines: string[] = [];
  if (invoice.workspaceEmail?.trim()) lines.push(invoice.workspaceEmail.trim());
  if (invoice.workspacePhone?.trim()) lines.push(invoice.workspacePhone.trim());
  if (invoice.workspaceWebsite?.trim()) lines.push(invoice.workspaceWebsite.trim());
  const location = formatPdfFromLocationLine(
    invoice.workspaceCity,
    invoice.workspaceCountry
  );
  if (location) lines.push(location);
  return lines;
}

export function InvoicePdfDocument({
  invoice,
  logoSrc,
}: InvoicePdfDocumentProps) {
  const currencyCode = invoice.currency || invoice.fallbackCurrency || "USD";
  const fmt = (amount: number) =>
    formatCurrency(amount, {
      currency: currencyCode,
      fallbackCurrency: currencyCode,
    });

  const workspaceName = invoice.workspaceName || "Your company";
  const displayStatus = invoice.displayStatus || "sent";
  const statusLabel = getInvoiceStatusLabel(displayStatus);
  const badge = statusBadgeColors(displayStatus);
  const contactLine = buildHeaderContactLine(
    invoice.workspaceEmail,
    invoice.workspacePhone
  );

  const fromLines = buildFromLines(invoice);

  const billLines: string[] = [];
  if (invoice.clientCompany?.trim()) billLines.push(invoice.clientCompany.trim());
  if (invoice.clientEmail?.trim()) billLines.push(invoice.clientEmail.trim());
  if (invoice.clientPhone?.trim()) billLines.push(invoice.clientPhone.trim());
  if (invoice.clientCountry?.trim()) billLines.push(invoice.clientCountry.trim());

  const thankYouBody = resolveThankYouBody(invoice.thankYouMessage);
  const thankYouLines = thankYouBody.split(/\r?\n/).filter(Boolean);

  const pd = invoice.paymentDetails;
  const methodLabel = paymentMethodLabel(pd);
  const bankFields: Array<{ key: string; value: string }> = [];
  if (pd?.bankName?.trim()) bankFields.push({ key: "Bank", value: pd.bankName.trim() });
  if (pd?.bankAccountName?.trim())
    bankFields.push({ key: "Account name", value: pd.bankAccountName.trim() });
  if (pd?.bankAccountNumber?.trim())
    bankFields.push({ key: "Account number", value: pd.bankAccountNumber.trim() });
  if (pd?.bankSwift?.trim()) bankFields.push({ key: "SWIFT", value: pd.bankSwift.trim() });
  if (pd?.bankIban?.trim()) bankFields.push({ key: "IBAN", value: pd.bankIban.trim() });

  const hasStructuredPayment =
    bankFields.length > 0 || Boolean(pd?.paypalHandle?.trim());
  const instructionLines = resolvePaymentInstructionLines(
    pd?.otherInstructions,
    hasStructuredPayment
  );

  const amountPaid = Number(invoice.amountPaid ?? 0);
  const outstanding = Number(invoice.outstanding ?? 0);

  const showPaymentSection =
    Boolean(methodLabel) ||
    bankFields.length > 0 ||
    Boolean(pd?.paypalHandle?.trim()) ||
    instructionLines.length > 0;
  const showNoteSection = thankYouLines.length > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View style={styles.companyBlock}>
            {logoSrc ? (
              <Image src={logoSrc} style={styles.logoImage} />
            ) : (
              <View style={styles.initialsBox}>
                <Text style={styles.initialsText}>
                  {companyInitials(workspaceName)}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.companyName}>{workspaceName}</Text>
              {contactLine ? (
                <Text style={styles.contactLine}>{contactLine}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.metaPanel}>
            <MetaItem
              label="Issue date"
              value={formatInvoiceDate(invoice.issueDate)}
            />
            <MetaItem
              label="Due date"
              value={formatInvoiceDate(invoice.dueDate)}
            />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.invoiceWord}>INVOICE</Text>
          <View style={styles.invoiceMetaRow}>
            <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
            <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusPillText, { color: badge.text }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <AddressCard
            label="From"
            name={workspaceName}
            lines={fromLines}
          />
          <AddressCard
            label="Bill to"
            name={invoice.clientName}
            lines={billLines}
          />
        </View>

        <View style={styles.lineItemsCard}>
          <Text style={styles.sectionTitle}>Line items</Text>

          <View style={styles.tableHead}>
            <View style={styles.colDesc}>
              <Text style={styles.thText}>Description</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={styles.thText}>Qty</Text>
            </View>
            <View style={styles.colUnit}>
              <Text style={styles.thText}>Unit price</Text>
            </View>
            <View style={styles.colAmt}>
              <Text style={styles.thText}>Amount</Text>
            </View>
          </View>

          {invoice.items.map((item, idx) => {
            const lineAmount = item.quantity * item.unit_price;
            const desc = item.description?.trim();
            return (
              <View key={`item-${idx}`} style={styles.tableRow}>
                <View style={styles.colDesc}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {desc ? <Text style={styles.itemDesc}>{desc}</Text> : null}
                </View>
                <View style={styles.colQty}>
                  <Text style={styles.cellText}>{String(item.quantity)}</Text>
                </View>
                <View style={styles.colUnit}>
                  <Text style={styles.cellText}>{fmt(item.unit_price)}</Text>
                </View>
                <View style={styles.colAmt}>
                  <Text style={styles.cellText}>{fmt(lineAmount)}</Text>
                </View>
              </View>
            );
          })}

          <View style={styles.totalsWrap}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(invoice.subtotal)}</Text>
            </View>
            {invoice.discountPercent > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  Discount ({invoice.discountPercent}%)
                </Text>
                <Text style={styles.discountValue}>
                  −{fmt(invoice.discountAmount)}
                </Text>
              </View>
            ) : null}
            {invoice.taxPercent > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Tax ({invoice.taxPercent}%)</Text>
                <Text style={styles.totalValue}>{fmt(invoice.taxAmount)}</Text>
              </View>
            ) : null}
            <View style={styles.emphasisRow}>
              <Text style={styles.emphasisLabel}>Total</Text>
              <Text style={styles.emphasisValue}>{fmt(invoice.total)}</Text>
            </View>
            {amountPaid > 0 ? (
              <View style={styles.paidRow}>
                <Text style={styles.totalLabel}>Amount paid</Text>
                <Text style={styles.paidValue}>{fmt(amountPaid)}</Text>
              </View>
            ) : null}
            {outstanding > 0 ? (
              <View style={styles.emphasisRow}>
                <Text style={styles.emphasisLabel}>Outstanding</Text>
                <Text style={styles.emphasisValue}>{fmt(outstanding)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {showPaymentSection || showNoteSection ? (
          <View style={styles.bottomRow}>
            {showPaymentSection ? (
              <View
                style={[
                  styles.card,
                  styles.bottomCard,
                  ...(!showNoteSection ? [styles.bottomCardFull] : []),
                ]}
              >
                <Text style={styles.cardLabel}>Payment details</Text>
                {methodLabel ? (
                  <Text style={styles.methodText}>{methodLabel}</Text>
                ) : null}
                {bankFields.map((row) => (
                  <View key={row.key} style={styles.payRow}>
                    <Text style={styles.payLine}>
                      <Text style={styles.payKey}>{row.key}: </Text>
                      {row.value}
                    </Text>
                  </View>
                ))}
                {pd?.paypalHandle?.trim() && bankFields.length === 0 ? (
                  <View style={styles.payRow}>
                    <Text style={styles.payLine}>
                      <Text style={styles.payKey}>PayPal: </Text>
                      {pd.paypalHandle.trim()}
                    </Text>
                  </View>
                ) : null}
                {instructionLines.map((line, i) => (
                  <Text key={`inst-${i}`} style={styles.instructionText}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {showNoteSection ? (
              <View
                style={[
                  styles.card,
                  styles.bottomCard,
                  ...(!showPaymentSection ? [styles.bottomCardFull] : []),
                ]}
              >
                <Text style={styles.cardLabel}>Note</Text>
                {thankYouLines.map((line, i) => (
                  <Text key={`note-${i}`} style={styles.noteText}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.footerColLeft}>
            <Text style={styles.footerLeftText}>
              Generated by <Text style={styles.footerBrand}>FlowCollect</Text>
            </Text>
          </View>
          <View style={styles.footerColRight}>
            <Text style={styles.footerRight}>We appreciate your business.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
