import { requireWorkspace } from "@/lib/auth/server";
import { PageHeader } from "@/components/layout/PageHeader";
import { getDailyActionCenterData } from "@/lib/actions/getDailyActionCenterData";
import { DailyActionCenterView } from "./_components/DailyActionCenterView";

type ActionsPageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function ActionsPage({ params }: ActionsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const data = await getDailyActionCenterData(workspaceId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Action Center"
        description="What needs collection attention today."
      />
      <DailyActionCenterView workspaceId={workspaceId} data={data} />
    </div>
  );
}
