import { supabase } from "../../lib/supabase";

export type SaveMachineRefillItemInput = {
  productId: string;

  issueQuantity: number;
  looseQuantity: number;
};

export type SaveMachineRefillInput = {
  sourceVisitId: string;

  clientId: string;
  stopId: string;
  machineId: string;

  confirmedAt: string;

  quantities: SaveMachineRefillItemInput[];
};

export async function saveMachineRefill(
  input: SaveMachineRefillInput,
): Promise<string> {
  const { data, error } =
    await supabase.rpc(
      "save_machine_refill",
      {
        p_source_visit_id:
          input.sourceVisitId,

        p_client_id:
          input.clientId,

        p_stop_id:
          input.stopId,

        p_machine_id:
          input.machineId,

        p_confirmed_at:
          input.confirmedAt,

        p_items:
          input.quantities.map(
            (quantity) => ({
              product_id:
                quantity.productId,

              issue_quantity:
                quantity.issueQuantity,

              loose_quantity:
                quantity.looseQuantity,
            }),
          ),
      },
    );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to save machine refill.",
    );
  }

  if (
    typeof data !== "string" ||
    data.trim().length === 0
  ) {
    throw new Error(
      "Machine refill was saved without an ID.",
    );
  }

  return data;
}