export function formatMoney(amount: number, currency: string = "USD") {
  if (Number.isNaN(amount)) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

