"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitSurveyResult = {
  success: boolean;
  message: string;
  alreadySubmitted: boolean;
};

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
      message: "Choose a rating from 1 to 5.",
      alreadySubmitted: false,
    };
  }

  const supabase = createAdminClient();

  const { data: summary, error: summaryError } =
    await supabase
      .from("service_visit_summaries")
      .select("id")
      .eq("survey_token", token)
      .maybeSingle();

  if (summaryError || !summary) {
    return {
      success: false,
      message: "This survey link is invalid.",
      alreadySubmitted: false,
    };
  }

  const { data: existing, error: existingError } =
    await supabase
      .from("service_visit_surveys")
      .select("id")
      .eq("summary_id", summary.id)
      .maybeSingle();

  if (existingError) {
    console.error(
      "Unable to check existing survey:",
      existingError,
    );

    return {
      success: false,
      message: "Unable to save your rating.",
      alreadySubmitted: false,
    };
  }

  if (existing) {
    return {
      success: true,
      message:
        "Thank you. Your feedback has already been recorded.",
      alreadySubmitted: true,
    };
  }

  const { error } = await supabase
    .from("service_visit_surveys")
    .insert({
      summary_id: summary.id,
      rating,
    });

  if (error) {
    console.error("Unable to save survey:", error);

    return {
      success: false,
      message: "Unable to save your rating.",
      alreadySubmitted: false,
    };
  }

  return {
    success: true,
    message: "Thank you for your feedback.",
    alreadySubmitted: false,
  };
}