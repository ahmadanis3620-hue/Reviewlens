"use server";

import { revalidatePath } from "next/cache";

import { assertBusinessAccess, requireUser } from "@/lib/auth/guards";
import { setActiveBusiness } from "@/lib/session/business";

/** Switches the active business, verifying access before writing the cookie. */
export async function switchBusiness(businessId: string): Promise<void> {
  const user = await requireUser();
  await assertBusinessAccess(businessId, user.organizationId);
  await setActiveBusiness(businessId);
  revalidatePath("/", "layout");
}
