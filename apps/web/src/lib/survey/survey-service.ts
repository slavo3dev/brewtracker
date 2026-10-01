import { createAdminClient } from "@/lib/supabase/admin";

export async function isSurveyTokenValid(
  token: string,
): Promise<boolean> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return false;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("service_visit_summaries")
    .select("id")
    .eq("survey_token", normalizedToken)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to validate survey token:",
      error,
    );

    return false;
  }

  return data !== null;
}