/**
 * Shared CTA appearance for list headers and toolbars.
 * Primary: solid blue, h-10 px-4; secondary: outline, smaller.
 */

export const primaryCtaClass =
  "inline-flex h-10 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 md:w-auto";

export const primaryCtaDisabledClass =
  "inline-flex h-10 w-full shrink-0 cursor-not-allowed items-center justify-center whitespace-nowrap rounded-lg bg-slate-200 px-4 text-sm font-medium text-slate-600 shadow-sm md:w-auto";

/** Export, Unarchive — outline secondary (aligned with list filter row h-10) */
export const secondaryToolbarClass =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

/** Reset filters beside Filters — ghost secondary */
export const secondaryGhostToolbarClass =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-transparent px-3 text-sm font-medium text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
