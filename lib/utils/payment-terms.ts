export const paymentTermsOptions = [
  { value: 0, label: "Due on Receipt" },
  { value: 7, label: "Net 7" },
  { value: 15, label: "Net 15" },
  { value: 30, label: "Net 30", isDefault: true },
  { value: 45, label: "Net 45" },
  { value: 60, label: "Net 60" },
] as const;

export const getPaymentTermsLabel = (days: number | null | undefined): string => {
  if (days === null || days === undefined) return "-";
  const option = paymentTermsOptions.find((opt) => opt.value === days);
  return option ? option.label : `${days} days`;
};
