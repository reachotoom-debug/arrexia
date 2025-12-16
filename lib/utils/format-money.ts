export function formatMoney(amount: number, currency: string = "USD") {
  if (Number.isNaN(amount) || amount === null || amount === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

