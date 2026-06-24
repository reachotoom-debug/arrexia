import Image from "next/image";

export function AuthBranding() {
  return (
    <div className="mb-8 text-center">
      <div className="mb-4 flex justify-center">
        <Image
          src="/brand/icon-logo.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 object-contain"
          priority
        />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        FlowCollect
      </h1>
      <p className="text-sm text-slate-500">Cash Solved.</p>
    </div>
  );
}
