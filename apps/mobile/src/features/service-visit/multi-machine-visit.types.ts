
import type {
  AfterServiceRecord,
  ArrivalVerification,
  BeforePhotoRecord,
  ClientConfirmationRecord,
  ClientReserveAfterRecord,
  DrinkCountRecord,
  InventoryAuditRecord,
  MachineScanVerification,
  MachineServiceConfirmationRecord,
  RestockDropRecord,
  ServiceVisitMachineTarget,
  ServiceVisitStatus,
  ServiceVisitSummaryRecord,
  ServiceVisitTarget,
} from "./service-visit.types";

export type StartUnifiedServiceVisitInput = {
  routeId: string;
  stopId: string;
  clientId: string;
  target: ServiceVisitTarget;
  machines: {
    machineId: string;
    sequenceNumber: number;
    drinkCountRequired: boolean;
    machineTarget: ServiceVisitMachineTarget;
  }[];
};

export type MultiMachineVisitStepId =
  | "arrival"
  | "inventory_audit"
  | "restock"
  | "machine_service"
  | "reserve_after"
  | "summary";

export type MachineServiceStepId =
  | "machine_scan"
  | "before_photos"
  | "drink_count"
  | "machine_refill"
  | "after_service";

export type MachineServiceState = {
  machineId: string;
  sequenceNumber: number;
  drinkCountRequired: boolean;

  machineTarget: ServiceVisitMachineTarget;

  currentStep: MachineServiceStepId;

  machineScanVerification: MachineScanVerification | null;
  beforePhotos: BeforePhotoRecord[];
  drinkCount: DrinkCountRecord | null;
  machineRefill: MachineServiceConfirmationRecord | null;
  afterService: AfterServiceRecord;

  completedAt: string | null;
};

export type MultiMachineServiceVisit = {
  schemaVersion: 2;

  id: string;
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;

  target: ServiceVisitTarget;

  status: ServiceVisitStatus;
  currentStep: MultiMachineVisitStepId;

  arrivalVerification: ArrivalVerification | null;
  arrivalSyncStatus: "not_started" | "pending_sync" | "synced" | "failed";

  inventoryAudit: InventoryAuditRecord | null;
  restockDrop: RestockDropRecord | null;
  reserveAfter: ClientReserveAfterRecord | null;

  machines: MachineServiceState[];
  activeMachineIndex: number;

  clientConfirmation: ClientConfirmationRecord;
  summary: ServiceVisitSummaryRecord;

  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};
