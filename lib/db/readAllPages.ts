/** Full ordered scans for financial/eligibility inputs. Caller must order by a unique key. */
export async function readAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
): Promise<{ data: T[]; error: null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await buildPage(from, from + pageSize - 1);
    if (page.error) throw new Error(`Incomplete dataset: ${page.error instanceof Error ? page.error.message : String((page.error as { message?: string }).message ?? page.error)}`);
    if (!page.data) throw new Error("Incomplete dataset: missing page data");
    data.push(...page.data);
    if (page.data.length < pageSize) return { data, error: null };
  }
}
