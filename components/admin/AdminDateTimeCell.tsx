"use client";

import { useEffect, useState } from "react";

import {
  EMPTY_TIMESTAMP_PLACEHOLDER,
  formatAdminDisplayDate,
  formatAdminDisplayDateTime,
  resolveAdminDisplayTimeZone,
} from "@/lib/datetime/formatDateTime";

type AdminDateTimeCellProps = {
  value: string | null;
  mode?: "datetime" | "date";
};

export function AdminDateTimeCell({ value, mode = "datetime" }: AdminDateTimeCellProps) {
  const [display, setDisplay] = useState<string>(() =>
    value ? formatAdminDisplayDateTime(value) : EMPTY_TIMESTAMP_PLACEHOLDER
  );

  useEffect(() => {
    if (!value) {
      setDisplay(EMPTY_TIMESTAMP_PLACEHOLDER);
      return;
    }

    const timeZone = resolveAdminDisplayTimeZone();
    setDisplay(
      mode === "date"
        ? formatAdminDisplayDate(value, timeZone)
        : formatAdminDisplayDateTime(value, timeZone)
    );
  }, [value, mode]);

  return <span suppressHydrationWarning>{display}</span>;
}
