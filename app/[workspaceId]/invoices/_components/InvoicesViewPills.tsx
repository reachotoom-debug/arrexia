"use client";

import * as React from "react";
import { SelectionProvider } from "./InvoicesTableUnarchiveButton";

/** Provides invoice row selection context for the list page (bulk unarchive, etc.). */
export function InvoicesViewPills({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  return (
    <SelectionProvider value={{ selectedIds, setSelectedIds }}>
      {children}
    </SelectionProvider>
  );
}
