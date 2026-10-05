"use server";

import { canReviewClockIns } from "@brewtracker/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserProfile } from "@/lib/auth/get-current-user";
import { autoCloseForgottenClockOuts } from "@/lib/time-clock/time-entry-service";

export async function autoCloseForgottenClockOutsAction() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canReviewClockIns(profile)) {
    redirect("/dashboard");
  }

  const updatedCount = await autoCloseForgottenClockOuts({
    reviewedBy: profile.id,
  });

  revalidatePath("/dashboard/time-clock/settings");
  revalidatePath("/dashboard/time-clock/entries");
  revalidatePath("/dashboard/time-clock/review");

  redirect(`/dashboard/time-clock/settings?autoCloseCount=${updatedCount}`);
}
