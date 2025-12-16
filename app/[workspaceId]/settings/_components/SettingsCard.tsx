/**
 * Simple Card component for Settings sections
 * Matches shadcn/ui Card pattern
 */

interface SettingsCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SettingsCard({
  title,
  description,
  children,
  footer,
}: SettingsCardProps) {
  return (
    <div className="rounded-xl bg-white p-6 border border-slate-200 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-6 pt-6 border-t border-slate-200">{footer}</div>}
    </div>
  );
}
