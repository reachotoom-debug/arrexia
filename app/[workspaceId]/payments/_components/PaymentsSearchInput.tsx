"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PaymentsSearchInputProps = {
  workspaceId: string;
  initialQ?: string;
};

export function PaymentsSearchInput({
  workspaceId,
  initialQ = "",
}: PaymentsSearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const urlSearchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(initialQ);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const urlQ = urlSearchParams.get("q") || "";
    if (urlQ !== searchValue) {
      setSearchValue(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearchParams]);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const trimmedValue = searchValue.trim();
      const currentUrlQ = urlSearchParams.get("q") || "";

      if (trimmedValue !== currentUrlQ) {
        const params = new URLSearchParams(urlSearchParams.toString());
        if (trimmedValue) {
          params.set("q", trimmedValue);
        } else {
          params.delete("q");
        }
        params.delete("page");
        const queryString = params.toString();
        router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
      }
    }, 350);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchValue, pathname, router, urlSearchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    const trimmedValue = searchValue.trim();
    const params = new URLSearchParams(urlSearchParams.toString());
    if (trimmedValue) {
      params.set("q", trimmedValue);
    } else {
      params.delete("q");
    }
    params.delete("page");
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
  };

  const handleClear = () => {
    setSearchValue("");
    const params = new URLSearchParams(urlSearchParams.toString());
    params.delete("q");
    params.delete("page");
    const queryString = params.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative flex w-full min-w-0 max-w-full items-center md:max-w-md lg:max-w-[28rem]"
    >
      <input
        type="text"
        name="q"
        placeholder="Search transaction, client, or invoice..."
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        className="h-10 w-full min-w-0 max-w-full rounded-lg border border-slate-200 px-3 pr-8 text-sm"
      />
      {searchValue ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
          aria-label="Clear search"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      ) : null}
    </form>
  );
}
