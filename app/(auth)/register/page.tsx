import RegisterForm from "@/components/auth/register-form";
import type { RegisterFormValues } from "@/lib/schemas/auth";

export default function RegisterPage() {
  async function handleSubmit(values: RegisterFormValues) {
    // For MVP v1 we don't implement full registration yet.
    console.log("[RegisterPage] TODO handleSubmit", values);
    // You can later replace this with a real API call or server action.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <RegisterForm onSubmit={handleSubmit} />
    </div>
  );
}

