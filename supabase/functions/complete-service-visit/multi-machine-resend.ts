export type MultiMachineResendInput = {
  apiKey: string;
  from: string;
  to: string;
  clientName: string;
  summaryId: string;
  html: string;
};

export async function sendMultiMachineServiceEmail(
  input: MultiMachineResendInput,
): Promise<void> {
  if (!input.apiKey.trim()) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!input.from.trim()) {
    throw new Error("SERVICE_EMAIL_FROM is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `brewtracker-service-${input.summaryId}`,
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: `Service completed — ${input.clientName}`,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const failure = await response.text();

    throw new Error(
      `Resend rejected multi-machine notification (${response.status}): ${failure}`,
    );
  }
}
