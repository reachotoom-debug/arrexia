export type ToolStatus = "live" | "coming-soon";

export type ToolDefinition = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  status: ToolStatus;
  href?: string;
  icon:
    | "calculator"
    | "aging"
    | "forecast"
    | "risk"
    | "interest"
    | "terms"
    | "capital"
    | "due-date";
};

export const LIVE_TOOLS: ToolDefinition[] = [
  {
    id: "dso-calculator",
    title: "DSO Calculator",
    description:
      "Calculate your Days Sales Outstanding (DSO) and understand how efficiently you collect payments.",
    estimatedTime: "30 seconds",
    status: "live",
    href: "/tools/dso-calculator",
    icon: "calculator",
  },
  {
    id: "invoice-aging-calculator",
    title: "Invoice Aging Calculator",
    description: "Analyze your receivables by aging buckets and overdue exposure.",
    estimatedTime: "1 minute",
    status: "live",
    href: "/tools/invoice-aging-calculator",
    icon: "aging",
  },
];

export const COMING_SOON_TOOLS: ToolDefinition[] = [
  {
    id: "cash-flow-forecast",
    title: "Cash Flow Forecast Calculator",
    description: "Project your future cash flow based on expected income and expenses.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "forecast",
  },
  {
    id: "collection-risk",
    title: "Collection Risk Calculator",
    description: "Identify and assess the risk of late payments.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "risk",
  },
  {
    id: "late-payment-interest",
    title: "Late Payment Interest Calculator",
    description: "Estimate late payment interest based on amount, rate, and days overdue.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "interest",
  },
  {
    id: "payment-terms",
    title: "Payment Terms Calculator",
    description: "Determine the best payment terms for your business and customers.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "terms",
  },
  {
    id: "working-capital",
    title: "Working Capital Calculator",
    description: "Calculate your working capital to measure short-term financial health.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "capital",
  },
  {
    id: "invoice-due-date",
    title: "Invoice Due Date Calculator",
    description: "Find the exact due date based on invoice date and payment terms.",
    estimatedTime: "Coming soon",
    status: "coming-soon",
    icon: "due-date",
  },
];

export const ALL_TOOLS: ToolDefinition[] = [...LIVE_TOOLS, ...COMING_SOON_TOOLS];
