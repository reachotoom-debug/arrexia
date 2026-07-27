"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { authPasswordInputClass } from "@/components/auth/authFormStyles";

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className, type: _ignoredType, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    const mergedClassName = className
      ? `${authPasswordInputClass} ${className}`
      : authPasswordInputClass;

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          className={mergedClassName}
        />
        <button
          type="button"
          tabIndex={0}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-2xl px-3 text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
