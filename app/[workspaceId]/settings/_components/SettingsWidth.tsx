/** Full-width settings column (Stripe-style max width). No sidebar. */
export function SettingsWidth({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[64rem] min-w-0 px-4 pb-10 pt-2 md:px-6">
      <div className="w-full max-w-none">{children}</div>
    </div>
  );
}
