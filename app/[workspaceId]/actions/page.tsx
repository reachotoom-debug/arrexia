import { requireWorkspace } from "@/lib/auth/server";
import { getDailyActionCenterData } from "@/lib/actions/getDailyActionCenterData";
import { buildActionCenterGreeting } from "@/lib/actions/morningGreeting";
import { getCurrentProfile } from "@/lib/profile/server";
import { DAILY_ACTION_CENTER_PAGE_SIZE } from "@/lib/actions/types";
import { DailyActionCenterView } from "./_components/DailyActionCenterView";

type ActionsPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ActionsPage({ params, searchParams }: ActionsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const resolvedSearchParams = (await searchParams) || {};
  const pageParam = (Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page) ?? "1";
  const requestedPage = Math.max(1, parseInt(pageParam, 10) || 1);

  const [data, profileResult] = await Promise.all([
    getDailyActionCenterData(workspaceId),
    getCurrentProfile(),
  ]);

  const totalItems = data.collectionActions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / DAILY_ACTION_CENTER_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * DAILY_ACTION_CENTER_PAGE_SIZE;
  const pagedActions = data.collectionActions.slice(
    start,
    start + DAILY_ACTION_CENTER_PAGE_SIZE
  );

  const greeting = buildActionCenterGreeting({
    fullName: profileResult.profile?.full_name ?? null,
    workspaceTimeZone: data.workspaceTimeZone,
  });

  return (
    <div className="w-full min-w-0">
      <DailyActionCenterView
        workspaceId={workspaceId}
        data={{ ...data, collectionActions: pagedActions }}
        greeting={greeting}
        pagination={{
          currentPage,
          totalPages,
          totalItems,
          pageSize: DAILY_ACTION_CENTER_PAGE_SIZE,
        }}
        queryParams={resolvedSearchParams}
      />
    </div>
  );
}
