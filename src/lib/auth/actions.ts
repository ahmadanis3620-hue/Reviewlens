"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fakeVerify, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  setSessionCookie,
} from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";
import { LIMITS, hit } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";

/**
 * Authentication server actions.
 *
 * Server Actions are reachable by direct POST, not only through the form, so
 * each one validates its own input and enforces its own rate limit.
 */

export type AuthState = { error?: string };

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.email("Enter a valid email address").max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200, "That password is too long"),
  organizationName: z
    .string()
    .trim()
    .min(1, "Enter your business or company name")
    .max(120),
});

const signInSchema = z.object({
  email: z.email("Enter a valid email address").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

async function clientIp(): Promise<string> {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let suffix = 1;

  while (await prisma.organization.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }

  return candidate;
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const ip = await clientIp();
  if (!hit(`signup:${ip}`, LIMITS.signup.limit, LIMITS.signup.windowMs).allowed) {
    return { error: "Too many sign-up attempts. Please try again later." };
  }

  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }

  const email = parsed.data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Sign-up has to say something useful, so this endpoint does confirm that
    // an address is taken. Sign-in deliberately does not.
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      memberships: {
        create: {
          role: "OWNER",
          organization: {
            create: {
              name: parsed.data.organizationName,
              slug: await uniqueSlug(parsed.data.organizationName),
              subscription: { create: {} },
            },
          },
        },
      },
    },
    select: { id: true },
  });

  log.info("user signed up", { userId: user.id });

  const store = await headers();
  const token = await createSession(user.id, store.get("user-agent") ?? undefined);
  await setSessionCookie(token);

  redirect("/onboarding");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const ip = await clientIp();
  if (!hit(`login:${ip}`, LIMITS.login.limit, LIMITS.login.windowMs).allowed) {
    return { error: "Too many sign-in attempts. Please try again later." };
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    // Burn comparable CPU so response time does not reveal whether the address
    // is registered, and return the same message either way.
    await fakeVerify();
    return { error: "Email or password is incorrect." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return { error: "Email or password is incorrect." };
  }

  const store = await headers();
  const token = await createSession(user.id, store.get("user-agent") ?? undefined);
  await setSessionCookie(token);

  const business = await prisma.business.findFirst({
    where: { organization: { memberships: { some: { userId: user.id } } } },
    select: { id: true },
  });

  redirect(business ? "/dashboard" : "/onboarding");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}
