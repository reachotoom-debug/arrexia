"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  buildCountryOptions,
  countryLabel,
  filterCountries,
} from "@/lib/clients/countrySelectFilter";

type SearchableCountrySelectProps = {
  value: string;
  onChange: (countryName: string) => void;
  error?: string;
  required?: boolean;
};

export function SearchableCountrySelect({
  value,
  onChange,
  error,
  required,
}: SearchableCountrySelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const options = useMemo(() => buildCountryOptions(value), [value]);

  const selected = useMemo(
    () => options.find((c) => c.name === value) ?? null,
    [options, value]
  );

  const filtered = useMemo(() => filterCountries(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setHighlightIndex(0);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectCountry = (countryName: string) => {
    onChange(countryName);
    setOpen(false);
    setQuery("");
    setHighlightIndex(0);
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    setOpen(true);
    setHighlightIndex(0);
  };

  const handleInputChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setOpen(true);
    setHighlightIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      setHighlightIndex(0);
      inputRef.current?.blur();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(0);
        return;
      }
      if (filtered.length === 0) return;
      setHighlightIndex((current) => Math.min(current + 1, filtered.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightIndex(0);
        return;
      }
      if (filtered.length === 0) return;
      setHighlightIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      if (!open || filtered.length === 0) return;
      event.preventDefault();
      const country = filtered[highlightIndex];
      if (country) {
        selectCountry(country.name);
      }
      return;
    }

    if (!open && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setOpen(true);
      setHighlightIndex(0);
    }
  };

  const inputValue = open ? query : "";
  const placeholder = selected
    ? countryLabel(selected)
    : value.trim()
      ? value
      : "Select country";

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1">
        Country {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && filtered.length > 0
            ? `${listboxId}-option-${highlightIndex}`
            : undefined
        }
        value={inputValue}
        placeholder={placeholder}
        onFocus={handleInputFocus}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="mt-1 text-xs text-slate-500">Search by country name or calling code</p>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul id={listboxId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
            ) : (
              filtered.map((country, index) => {
                const isSelected = country.name === value;
                const isHighlighted = index === highlightIndex;
                return (
                  <li
                    key={`${country.code}-${country.name}`}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                        isHighlighted
                          ? "bg-slate-100"
                          : isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-800"
                      }`}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectCountry(country.name)}
                    >
                      {countryLabel(country)}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
