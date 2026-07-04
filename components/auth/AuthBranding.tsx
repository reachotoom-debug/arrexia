import { ArrexiaLogo } from "@/components/brand/ArrexiaLogo";
import { authBrandNameClass, authTaglineClass } from "@/components/auth/authFormStyles";

export function AuthBranding() {
  return (
    <div className="mb-7 text-center sm:mb-8">
      <div className="flex shrink-0 justify-center">
        <ArrexiaLogo
          variant="icon"
          height={112}
          className="h-24 w-24 sm:h-28 sm:w-28"
          priority
        />
      </div>
      <h1 className={authBrandNameClass}>Arrexia</h1>
      <p className={authTaglineClass}>Cash Solved.</p>
    </div>
  );
}
