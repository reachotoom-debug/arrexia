import { requireWorkspace } from "@/lib/auth/server";
import { getDailyActionCenterData } from "@/lib/actions/getDailyActionCenterData";
import { buildActionCenterGreeting } from "@/lib/actions/morningGreeting";
import { getCurrentProfile } from "@/lib/profile/server";
import { DailyActionCenterView } from "./_components/DailyActionCenterView";

type ActionsPageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function ActionsPage({ params }: ActionsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const [data, profileResult] = await Promise.all([
    getDailyActionCenterData(workspaceId),
    getCurrentProfile(),
  ]);

  const greeting = buildActionCenterGreeting({
    fullName: profileResult.profile?.full_name ?? null,
    workspaceTimeZone: data.workspaceTimeZone,
  });

  return (
    <div className="w-full min-w-0">
      <DailyActionCenterView workspaceId={workspaceId} data={data} greeting={greeting} />
    </div>
  );
}
