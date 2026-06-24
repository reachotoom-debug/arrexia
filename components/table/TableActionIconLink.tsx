"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TableActionIconLinkProps {
  href: string;
  label: string;
  icon: React.ReactNode;
  className?: string;
}

export function TableActionIconLink({
  href,
  label,
  icon,
  className = "",
}: TableActionIconLinkProps) {
  const defaultClassName = "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors";
  
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={className || defaultClassName}
            aria-label={label}
            title={label}
          >
            {icon}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
