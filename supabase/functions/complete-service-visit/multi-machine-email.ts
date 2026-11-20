export type MultiMachineEmailItem = {
  machineId: string;
  sequenceNumber: number;
  name: string | null;
  model: string | null;
  serialNumber: string | null;
  outcome: "refilled" | "not_needed" | "unable_to_refill";
  reason: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const OUTCOME_LABELS: Record<MultiMachineEmailItem["outcome"], string> = {
  refilled: "Refilled",
  not_needed: "Refill not needed",
  unable_to_refill: "Unable to refill",
};

export function createMultiMachineEmailHtml(
  machines: MultiMachineEmailItem[],
): string {
  const items = [...machines]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((machine) => {
      const name = escapeHtml(
        machine.name || `Machine ${machine.sequenceNumber}`,
      );
      const model = escapeHtml(machine.model || "N/A");
      const serial = escapeHtml(machine.serialNumber || "N/A");
      const outcome = OUTCOME_LABELS[machine.outcome];

      const reason =
        machine.outcome === "unable_to_refill" && machine.reason
          ? `<p>Reason: ${escapeHtml(machine.reason)}</p>`
          : "";

      return `
        <li>
          <strong>${name}</strong>
          <p>Model: ${model}</p>
          <p>Serial number: ${serial}</p>
          <p>Service outcome: ${outcome}</p>
          ${reason}
        </li>
      `;
    })
    .join("");

  return `
    <h2>Machines serviced</h2>
    <ol>${items}</ol>
  `;
}
