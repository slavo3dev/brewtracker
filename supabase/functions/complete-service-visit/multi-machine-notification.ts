import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MultiMachineNotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "skipped";

export type MultiMachineNotificationClaim = {
  summaryId: string;
  token: string;
};

export async function claimMultiMachineNotification(
  supabaseAdmin: SupabaseClient,
  summaryId: string,
): Promise<MultiMachineNotificationClaim | null> {
  const token = crypto.randomUUID();

  const { data, error } = await supabaseAdmin.rpc(
    "claim_multi_machine_notification",
    {
      p_summary_id: summaryId,
      p_claim_token: token,
    },
  );

  if (error) {
    throw new Error(`Unable to claim notification: ${error.message}`);
  }

  if (data !== true) {
    return null;
  }

  return { summaryId, token };
}

export async function finalizeMultiMachineNotification(
  supabaseAdmin: SupabaseClient,
  claim: MultiMachineNotificationClaim,
  status: "sent" | "failed" | "skipped",
  errorMessage: string | null = null,
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    "finalize_multi_machine_notification",
    {
      p_summary_id: claim.summaryId,
      p_claim_token: claim.token,
      p_status: status,
      p_error: errorMessage,
    },
  );

  if (error) {
    throw new Error(`Unable to finalize notification: ${error.message}`);
  }

  if (data !== true) {
    throw new Error(
      "Notification claim is no longer owned by this request.",
    );
  }
}
