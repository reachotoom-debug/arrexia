/** Shared UI-only layout classes for scroll-contained tables (no data/query changes). */

/** Card chrome around a horizontally scrolling table (scroll lives on the viewport inside HorizontalScrollArea). */
export const TABLE_CARD_OUTER =
  "relative w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white shadow-sm";

/** Action icon/button groups in table cells — never wrap to two lines. */
export const TABLE_ACTIONS_ROW =
  "flex shrink-0 items-center justify-end gap-2 whitespace-nowrap";

/** Inner width floor so tables scroll inside the card on narrow viewports */
export const TABLE_MIN_WIDTH_INNER = "min-w-[60rem]";

export const TABLE_BASE = `w-full ${TABLE_MIN_WIDTH_INNER} table-auto text-sm leading-5`;

/** Client / email / notes columns — constrain width so rows don’t blow out the card */
export const TABLE_CELL_TEXT_COL = "min-w-0 max-w-[12rem] break-words";

/** Dense list tables: header cells */
export const TABLE_TH =
  "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600";
export const TABLE_TH_RIGHT =
  "px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600";
export const TABLE_TH_CENTER =
  "px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-600";

/** Dense list tables: body cells */
export const TABLE_TD = "px-3 py-2.5 align-middle";
export const TABLE_TD_RIGHT =
  "px-3 py-2.5 align-middle text-right tabular-nums whitespace-nowrap";

/** Dense list tables: row chrome */
export const TABLE_ROW =
  "border-b border-slate-100 hover:bg-gray-50 transition-colors";
