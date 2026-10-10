"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitSurveyResult =
  | {
      success: true;
      status: "created";
      message: string;
    }
  | {
      success: true;
      status: "already_submitted";
      message: string;
    }
  | {
      success: false;
      status: "error";
      message: string;
    };

export async function submitSurvey(
  token: string,
  rating: number,
): Promise<SubmitSurveyResult> {
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return {
      success: false,
      status: "error",
      message: "Choose a rating from 1 to 5.",
    };
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return {
      success: false,
      status: "error",
      message: "This survey link is invalid.",
    };
  }

  const supabase = createAdminClient();

  const {
    data: summary,
    error: summaryError,
  } = await supabase
    .from("service_visit_summaries")
    .select("id")
    .eq("survey_token", normalizedToken)
    .maybeSingle();

  if (summaryError || !summary) {
    return {
      success: false,
      status: "error",
      message: "This survey link is invalid.",
    };
  }

  /*
   * Give the user a clear result if this visit has
   * already received feedback.
   */
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("service_visit_surveys")
    .select("id")
    .eq("summary_id", summary.id)
    .maybeSingle();

  if (existingError) {
    return {
      success: false,
      status: "error",
      message:
        "Unable to check the existing rating.",
    };
  }

  if (existing) {
    return {
      success: true,
      status: "already_submitted",
      message:
        "Feedback for this service visit has already been recorded.",
    };
  }

  const { error } = await supabase
    .from("service_visit_surveys")
    .insert({
      summary_id: summary.id,
      rating,
    });

  if (error) {
    /*
     * Race-condition protection:
     *
     * The database UNIQUE constraint remains the final
     * authority. Two requests could theoretically both
     * pass the existing-rating check before one inserts.
     */
    if (error.code === "23505") {
      return {
        success: true,
        status: "already_submitted",
        message:
          "Feedback for this service visit has already been recorded.",
      };
    }

    return {
      success: false,
      status: "error",
      message: "Unable to save your rating.",
    };
  }

  return {
    success: true,
    status: "created",
    message: "Thank you for your feedback.",
  };
}

export async function getGoogleReviewUrl(): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("app_settings")
    .select("google_review_url")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to load Google review URL:",
      error,
    );

    return null;
  }

  return data?.google_review_url?.trim() || null;
}

