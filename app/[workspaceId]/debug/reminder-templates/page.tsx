import { supabaseServer } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function ReminderTemplatesDebugPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("reminder_templates")
    .select("id, workspace_id, code, name, is_enabled")
    .order("workspace_id")
    .order("code");

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Reminder Templates Debug</h1>

      {error && (
        <pre className="rounded border border-destructive/50 bg-destructive/10 p-4 text-xs text-destructive">
          {JSON.stringify(
            {
              message: (error as any)?.message,
              code: (error as any)?.code,
              details: (error as any)?.details,
              hint: (error as any)?.hint,
            },
            null,
            2
          )}
        </pre>
      )}

      <pre className="rounded border bg-muted p-4 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

