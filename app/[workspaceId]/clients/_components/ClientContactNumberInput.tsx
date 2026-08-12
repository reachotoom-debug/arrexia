"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatCountryDialPrefix,
  splitContactNumberForDisplay,
} from "@/lib/clients/clientPhoneInput";

type ClientContactNumberInputProps = {
  id: string;
  label: string;
  hint: string;
  country: string;
  storedValue: string;
  onStoredValueChange: (value: string) => void;
  error?: string;
  placeholder?: string;
};

export function ClientContactNumberInput({
  id,
  label,
  hint,
  country,
  storedValue,
  onStoredValueChange,
  error,
  placeholder = "Local or full international",
}: ClientContactNumberInputProps) {
  const dialPrefix = useMemo(() => formatCountryDialPrefix(country), [country]);
  const [inputValue, setInputValue] = useState("");
  const [showCountryPrefix, setShowCountryPrefix] = useState(true);

  useEffect(() => {
    const split = splitContactNumberForDisplay(storedValue, country);
    setInputValue(split.inputValue);
    setShowCountryPrefix(split.showCountryPrefix);
  }, [storedValue, country]);

  const prefixLabel = showCountryPrefix && dialPrefix ? dialPrefix : null;

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600 mb-1">
        {label}
      </label>
      <div className="flex overflow-hidden rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
        {prefixLabel ? (
          <span className="inline-flex shrink-0 items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 tabular-nums">
            {prefixLabel}
          </span>
        ) : null}
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={inputValue}
          onChange={(e) => {
            const next = e.target.value;
            setInputValue(next);
            setShowCountryPrefix(!next.trim().startsWith("+"));
            onStoredValueChange(next);
          }}
          placeholder={placeholder}
          className="w-full min-w-0 px-3 py-2 text-sm focus:outline-none"
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
