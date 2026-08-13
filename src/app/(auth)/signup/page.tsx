import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { signUp } from "@/lib/auth/actions";

export const metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold tracking-[-0.01em]">
        Create your account
      </h1>
      <p className="mt-1 text-sm text-ink-secondary">
        You can load demo data on the next step — no review source needed to look
        around.
      </p>

      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          {
            name: "name",
            label: "Your name",
            type: "text",
            autoComplete: "name",
            required: true,
          },
          {
            name: "organizationName",
            label: "Business or company name",
            type: "text",
            autoComplete: "organization",
            required: true,
          },
          {
            name: "email",
            label: "Work email",
            type: "email",
            autoComplete: "email",
            required: true,
          },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "new-password",
            required: true,
            hint: "At least 10 characters.",
          },
        ]}
      />

      <p className="mt-5 text-sm text-ink-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
