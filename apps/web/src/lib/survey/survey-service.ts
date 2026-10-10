import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function isSurveyTokenValid(token: string): Promise<boolean> {
  const normalizedToken = token.trim();

  if (!normalizedToken || !UUID_PATTERN.test(normalizedToken)) {
    return false;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("service_visit_summaries")
    .select("id")
    .eq("survey_token", normalizedToken)
    .maybeSingle();

  if (error) {
    console.error("Unable to validate survey token:", error);

    return false;
  }

  return data !== null;
}
