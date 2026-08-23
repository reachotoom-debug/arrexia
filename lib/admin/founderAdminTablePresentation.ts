export const FOUNDER_ADMIN_TABLE_PAGE_SIZE = 100;

export type FounderAdminTableQuery = {
  page?: number;
  pageSize?: number;
};

export type FounderAdminTableResult<T> = {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function parseFounderAdminTablePage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === "") return 1;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function compareDescTimestamps(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const aMs = a ? Date.parse(a) : Number.NEGATIVE_INFINITY;
  const bMs = b ? Date.parse(b) : Number.NEGATIVE_INFINITY;
  return bMs - aMs;
}

export function sortRowsByDescTimestamp<T>(
  rows: T[],
  getTimestamp: (row: T) => string | null | undefined
): T[] {
  return [...rows].sort((a, b) =>
    compareDescTimestamps(getTimestamp(a), getTimestamp(b))
  );
}

export function paginateFounderAdminRows<T>(
  rows: T[],
  query: FounderAdminTableQuery = {}
): FounderAdminTableResult<T> {
  const pageSize = query.pageSize ?? FOUNDER_ADMIN_TABLE_PAGE_SIZE;
  const requestedPage = query.page ?? 1;
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/** Most recent subscription activity first; falls back to workspace creation. */
export function getFounderSubscriberSortTimestamp(row: {
  subscriptionUpdatedAt: string | null;
  workspaceCreatedAt: string;
}): string {
  return row.subscriptionUpdatedAt ?? row.workspaceCreatedAt;
}
