import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { signIn } from "@/lib/auth/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold tracking-[-0.01em]">Sign in</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Welcome back. Sign in to see your reputation dashboard.
      </p>

      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        fields={[
          {
            name: "email",
            label: "Email",
            type: "email",
            autoComplete: "email",
            required: true,
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
            required: true,
          },
        ]}
      />

      <p className="mt-5 text-sm text-ink-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
