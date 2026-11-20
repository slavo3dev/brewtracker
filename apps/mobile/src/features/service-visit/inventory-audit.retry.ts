import {
  loadClientInventoryProducts,
} from "./inventory-audit.service";
import {
  recoverLegacyAuditConfiguration,
} from "./inventory-audit-recovery";
import type {
  MultiMachineServiceVisit,
} from "./multi-machine-visit.types";

export async function prepareUnifiedInventoryAuditRetry(
  visit: MultiMachineServiceVisit,
): Promise<MultiMachineServiceVisit> {
  if (
    visit.status !== "in_progress" ||
    visit.currentStep !== "inventory_audit"
  ) {
    throw new Error("Inventory Audit is not the current visit step.");
  }

  const audit = visit.inventoryAudit;

  if (
    !audit ||
    audit.sourceVisitId !== visit.id ||
    audit.syncStatus === "synced"
  ) {
    throw new Error("There is no unfinished inventory audit to retry.");
  }

  if (audit.configuredProducts?.length) {
    return visit;
  }

  const availableProducts = await loadClientInventoryProducts(
    visit.clientId,
  );

  const recoveredProducts = recoverLegacyAuditConfiguration(
    audit,
    availableProducts,
  );

  return {
    ...visit,
    inventoryAudit: {
      ...audit,
      configuredProducts: recoveredProducts,
    },
    updatedAt: new Date().toISOString(),
  };
}
