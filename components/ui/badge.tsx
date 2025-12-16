import * as React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline";
  className?: string;
}

const variantStyles = {
  default: "bg-blue-100 text-blue-700",
  secondary: "bg-slate-100 text-slate-700",
  destructive: "bg-red-100 text-red-700",
  outline: "border border-slate-300 text-slate-700",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
