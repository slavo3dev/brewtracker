"use server";

import type { TimeEntryReviewStatus } from "@/lib/time-clock/time-entry-service";
import { canReviewClockIns } from "@brewtracker/types";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/get-current-user";
import { reviewTimeEntry } from "@/lib/time-clock/time-entry-service";
import type { ReviewActionResult } from "./action-state";

async function requireClockInReviewer() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canReviewClockIns(profile)) {
    redirect("/dashboard");
  }

  return profile;
}

async function handleReview(
  formData: FormData,
  reviewStatus: TimeEntryReviewStatus,
): Promise<ReviewActionResult> {
  const reviewer = await requireClockInReviewer();

  const timeEntryId = String(formData.get("timeEntryId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "").trim() || null;

  if (!timeEntryId) {
    return {
      error: "Missing time entry id.",
      success: null,
    };
  }

  try {
    await reviewTimeEntry({
      timeEntryId,
      reviewedBy: reviewer.id,
      reviewStatus,
      reviewNote,
    });

    revalidatePath("/dashboard/time-clock/review");

    return {
      error: null,
      success: `Clock-in ${reviewStatus}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to review clock-in.",
      success: null,
    };
  }
}

export async function approveClockIn(
  _prevState: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  return handleReview(formData, "approved");
}

export async function flagClockIn(
  _prevState: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  return handleReview(formData, "flagged");
}

export async function rejectClockIn(
  _prevState: ReviewActionResult,
  formData: FormData,
): Promise<ReviewActionResult> {
  return handleReview(formData, "rejected");
}