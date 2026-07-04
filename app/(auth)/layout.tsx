export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-50 bg-[radial-gradient(ellipse_at_top,rgba(79,110,247,0.09)_0%,transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(99,102,241,0.07)_0%,transparent_48%)]"
      />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
