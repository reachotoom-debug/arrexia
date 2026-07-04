"use client";

import { useState } from "react";
import { ScrollTabStrip } from "@/components/layout/ScrollTabStrip";
import { cn } from "@/lib/utils";
import { ReminderSettingsForm } from "./ReminderSettingsForm";
import { ReminderTemplatesSection } from "./ReminderTemplatesSection";
import { ReminderRulesSection } from "./ReminderRulesSection";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";
import type { Database } from "@/types/supabase/index";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];
type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"] & {
  reminder_templates: { name: string } | null;
};

type TabId = "automation" | "templates" | "rules";

export function RemindersSettingsTabs({
  workspaceId,
  settings,
  templates,
  rules,
  canManageRules,
}: {
  workspaceId: string;
  settings: WorkspaceSettings;
  templates: ReminderTemplateRow[];
  rules: ReminderRuleRow[];
  canManageRules: boolean;
}) {
  const [tab, setTab] = useState<TabId>("automation");

  const tabBtn = (active: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium transition-colors",
      active
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
    );

  return (
    <div className="w-full max-w-5xl space-y-6">
      <ScrollTabStrip aria-label="Reminders sections">
        <button type="button" className={tabBtn(tab === "automation")} onClick={() => setTab("automation")}>
          Automation
        </button>
        <button type="button" className={tabBtn(tab === "templates")} onClick={() => setTab("templates")}>
          Templates
        </button>
        <button type="button" className={tabBtn(tab === "rules")} onClick={() => setTab("rules")}>
          Rules
        </button>
      </ScrollTabStrip>

      <div className={cn(tab !== "automation" && "hidden")}>
        <ReminderSettingsForm workspaceId={workspaceId} settings={settings} />
      </div>
      <div className={cn(tab !== "templates" && "hidden")}>
        <ReminderTemplatesSection workspaceId={workspaceId} templates={templates} />
      </div>
      <div className={cn(tab !== "rules" && "hidden")}>
        <ReminderRulesSection
          workspaceId={workspaceId}
          rules={rules}
          templates={templates}
          canManageRules={canManageRules}
        />
      </div>
    </div>
  );
}
