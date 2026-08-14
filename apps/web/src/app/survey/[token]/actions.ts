"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function submitSurvey(
  token: string,
  rating: number,
): Promise<{
  success: boolean;
  message: string;
}> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return {
      success: false,
      message: "Choose a rating from 1 to 5.",
    };
  }

  const supabase = createAdminClient();

  const { data: summary, error: summaryError } = await supabase
    .from("service_visit_summaries")
    .select("id")
    .eq("survey_token", token)
    .maybeSingle();

  if (summaryError || !summary) {
    return {
      success: false,
      message: "This survey link is invalid.",
    };
  }

  const { data: existing } = await supabase
    .from("service_visit_surveys")
    .select("id")
    .eq("summary_id", summary.id)
    .maybeSingle();

  if (existing) {
    return {
      success: true,
      message: "Thank you. Your feedback has already been recorded.",
    };
  }

  const { error } = await supabase.from("service_visit_surveys").insert({
    summary_id: summary.id,

    rating,
  });

  if (error) {
    return {
      success: false,
      message: "Unable to save your rating.",
    };
  }

  return {
    success: true,
    message: "Thank you for your feedback.",
  };
}
