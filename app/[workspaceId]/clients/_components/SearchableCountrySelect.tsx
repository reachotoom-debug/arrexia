"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { countries, type Country } from "@/lib/utils/countries";

type SearchableCountrySelectProps = {
  value: string;
  onChange: (countryName: string) => void;
  error?: string;
  required?: boolean;
};

function buildCountryOptions(savedCountry: string): Country[] {
  const saved = savedCountry.trim();
  if (!saved || countries.some((c) => c.name === saved)) {
    return countries;
  }
  return [
    ...countries,
    { code: "XX", name: saved, flag: "🏳️", dialCode: "" },
  ];
}

function countryLabel(country: Country): string {
  const dial = country.dialCode ? ` (+${country.dialCode})` : "";
  return `${country.flag} ${country.name}${dial}`;
}

export function SearchableCountrySelect({
  value,
  onChange,
  error,
  required,
}: SearchableCountrySelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const options = useMemo(() => buildCountryOptions(value), [value]);

  const selected = useMemo(
    () => options.find((c) => c.name === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.includes(q.replace(/\D/g, ""))
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1">
        Country {required ? <span className="text-red-500">*</span> : null}
      </label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="truncate">
          {selected ? countryLabel(selected) : value || "Select country"}
        </span>
        <span className="ml-2 text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      <p className="mt-1 text-xs text-slate-500">Search by country name or calling code</p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries…"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search countries"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
            ) : (
              filtered.map((country) => (
                <li key={`${country.code}-${country.name}`} role="option">
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      country.name === value ? "bg-blue-50 text-blue-700" : "text-slate-800"
                    }`}
                    onClick={() => {
                      onChange(country.name);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {countryLabel(country)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
