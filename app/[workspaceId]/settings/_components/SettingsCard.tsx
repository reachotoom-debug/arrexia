/**
 * Content card inside the settings panel (rounded-xl, consistent padding).
 */

interface SettingsCardProps {
  /** Omit when the page header (SettingsSectionChrome) already names the section. */
  title?: string;
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
    <section className="w-full max-w-none rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {(title || description) && (
        <div className="mb-6">
          {title && (
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-4">{children}</div>
      {footer && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          {footer}
        </div>
      )}
    </section>
  );
}
