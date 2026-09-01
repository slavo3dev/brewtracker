import type { Database, GeoPoint } from "@brewtracker/types";
import type { InventoryProductPackaging } from "@brewtracker/types";

export const SERVICE_VISIT_STEPS = [
  {
    id: "arrival",
    title: "Arrival",
  },
  {
    id: "machine_scan",
    title: "Scan Machine",
  },
  {
    id: "before_photos",
    title: "Before Photos",
  },
  {
    id: "drink_count",
    title: "Drink Count",
  },
  {
    id: "inventory_audit",
    title: "Inventory Audit",
  },
  {
    id: "restock",
    title: "Recommended Refill",
  },
  {
    id: "after_service",
    title: "After Service Photo",
  },
  {
    id: "summary",
    title: "Review & Complete",
  },
] as const;

export const BEFORE_PHOTO_KINDS = ["exterior", "interior_hopper"] as const;

export type ServiceVisitStepId = (typeof SERVICE_VISIT_STEPS)[number]["id"];

export type ServiceVisitStatus = "in_progress" | "completed" | "cancelled";

export type ServiceVisitStepStatus = "locked" | "current" | "completed";

export type ServiceVisitStepState = {
  id: ServiceVisitStepId;
  status: ServiceVisitStepStatus;
  completedAt: string | null;
};

export type ServiceVisitTarget = {
  clientName: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
};

export type ServiceVisitTasks = {
  drinkCountRequired: boolean;
};

export type ServiceVisitMachineTarget = {
  id: string;
  name: string | null;
  model: string | null;
  serialNumber: string | null;
  qrCode: string;

  status: Database["public"]["Enums"]["machine_status"];
  installedAt: string | null;
  lastServiceAt: string | null;
};

export type ArrivalVerificationMethod = "geofence" | "manual_override";

export type ArrivalVerification = {
  method: ArrivalVerificationMethod;

  driverPosition: GeoPoint | null;
  targetPosition: GeoPoint | null;

  distanceMeters: number | null;
  geofenceRadiusMeters: number;

  overrideReason: string | null;
  verifiedAt: string;
};

export type MachineScanVerification = {
  scannedValue: string;
  expectedQrCode: string;
  machineId: string;
  verifiedAt: string;
};

export type BeforePhotoKind = (typeof BEFORE_PHOTO_KINDS)[number];

export type BeforePhotoUploadStatus =
  | "pending_upload"
  | "uploading"
  | "uploaded"
  | "failed";

export type BeforePhotoRecord = {
  kind: BeforePhotoKind;

  /**
   * Durable URI inside FileSystem.documentDirectory.
   * Do not save the temporary CameraView URI here.
   */
  localUri: string;

  /**
   * Private Supabase Storage object path.
   * This is not a public URL.
   */
  storagePath: string | null;
  databaseId: string | null;
  uploadStatus: BeforePhotoUploadStatus;
  uploadError: string | null;

  capturedAt: string;
  uploadedAt: string | null;
};

export type SaveBeforePhotoInput = {
  kind: BeforePhotoKind;
  localUri: string;
  capturedAt: string;
};

export type UpdateBeforePhotoUploadInput = {
  uploadStatus: BeforePhotoUploadStatus;
  storagePath?: string | null;
  databaseId?: string | null;
  uploadError?: string | null;
  uploadedAt?: string | null;
};

export type MediaUploadStatus =
  | "pending_upload"
  | "uploading"
  | "uploaded"
  | "failed";

export type AfterPhotoRecord = {
  localUri: string;
  storagePath: string | null;
  databaseId: string | null;
  uploadStatus: MediaUploadStatus;
  uploadError: string | null;
  capturedAt: string;
  uploadedAt: string | null;
};

export type AfterServiceRecord = {
  afterPhoto: AfterPhotoRecord | null;
};

export type SaveAfterPhotoInput = {
  localUri: string;
  capturedAt: string;
};

export type UpdateMediaUploadInput = {
  uploadStatus: MediaUploadStatus;
  storagePath?: string | null;
  databaseId?: string | null;
  uploadError?: string | null;
  uploadedAt?: string | null;
};

export type DrinkCountRecord = {
  databaseId: string;
  sourceVisitId: string;

  runningTotal: number;
  archiveTotal: number;

  recordedAt: string;
};

export type CompleteDrinkCountInput = {
  runningTotal: number;
};

export type InventoryProductCategory =
  Database["public"]["Enums"]["inventory_product_category"];

export type ClientInventoryProduct = {
  productId: string;
  sku: string | null;
  name: string;
  category: InventoryProductCategory;

  unitLabel: string;

  packaging: InventoryProductPackaging;

  displayOrder: number;
  isRequired: boolean;
  parLevel: number | null;
};

export type ClientReserveCountInput = {
  productId: string;

  issueQuantity: number;
  looseQuantity: number;
};

export type CompleteInventoryAuditInput = {
  counts: ClientReserveCountInput[];
};

export type InventoryAuditItemRecord = {
  productId: string;

  sku: string | null;
  name: string;
  category: InventoryProductCategory;

  unitLabel: string;

  issueQuantity: number;
  looseQuantity: number;

  normalizedQuantity: number;
  normalizedUnit: string;

  previousReserveAfter: number | null;
  reserveDecrease: number | null;
};

export type InventoryAuditSyncStatus = "pending_sync" | "synced" | "failed";

export type InventoryAuditRecord = {
  databaseId: string | null;
  sourceVisitId: string;
  countedAt: string;
  items: InventoryAuditItemRecord[];
  syncStatus: InventoryAuditSyncStatus;
  syncError: string | null;
};

export type RestockDropQuantityInput = {
  productId: string;
  actualQuantity: number;
};

export type CompleteRestockDropInput = {
  quantities: RestockDropQuantityInput[];
};

export type RestockDropItemRecord = {
  productId: string;
  sku: string | null;
  name: string;
  category: InventoryProductCategory;
  unitLabel: string;

  countedQuantity: number;
  parLevel: number;
  recommendedQuantity: number;
  actualQuantity: number;
};

export type RestockDropSyncStatus = "pending_sync" | "synced" | "failed";

export type RestockDropRecord = {
  databaseId: string | null;
  sourceVisitId: string;
  inventoryAuditId: string;
  confirmedAt: string;
  items: RestockDropItemRecord[];
  syncStatus: RestockDropSyncStatus;
  syncError: string | null;
};

export type CompleteMachineScanInput = {
  scannedValue: string;
};

export type SummarySyncStatus =
  | "not_started"
  | "pending_sync"
  | "synced"
  | "failed";

export type ServiceVisitSummaryRecord = {
  syncStatus: SummarySyncStatus;
  syncError: string | null;

  databaseId: string | null;
  surveyToken: string | null;
  emailSentAt: string | null;
};

export type CompleteServiceVisitResult = {
  summaryId: string;
  surveyToken: string;
  notificationStatus: "pending" | "sent" | "failed" | "skipped";
  emailSentAt: string | null;
};

export type ServiceVisit = {
  id: string;
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;
  machineId: string;

  target: ServiceVisitTarget;
  machineTarget: ServiceVisitMachineTarget;

  status: ServiceVisitStatus;
  currentStep: ServiceVisitStepId;

  steps: ServiceVisitStepState[];

  arrivalVerification: ArrivalVerification | null;
  machineScanVerification: MachineScanVerification | null;
  beforePhotos: BeforePhotoRecord[];
  tasks: ServiceVisitTasks;

  drinkCount: DrinkCountRecord | null;
  inventoryAudit: InventoryAuditRecord | null;
  restockDrop: RestockDropRecord | null;
  afterService: AfterServiceRecord;
  summary: ServiceVisitSummaryRecord;

  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type StartServiceVisitInput = {
  userId: string;
  routeId: string;
  stopId: string;
  clientId: string;
  machineId: string;

  target: ServiceVisitTarget;
  machineTarget: ServiceVisitMachineTarget;

  tasks: ServiceVisitTasks;
};

export type CompleteArrivalInput = {
  method: ArrivalVerificationMethod;

  driverPosition: GeoPoint | null;
  targetPosition: GeoPoint | null;

  distanceMeters: number | null;
  geofenceRadiusMeters: number;

  overrideReason?: string | null;
};

export function getServiceVisitStep(stepId: ServiceVisitStepId) {
  return SERVICE_VISIT_STEPS.find((step) => step.id === stepId);
}

export function createInitialStepStates(
  tasks: ServiceVisitTasks,
): ServiceVisitStepState[] {
  return getRequiredServiceVisitSteps(tasks).map((step, index) => ({
    id: step.id,
    status: index === 0 ? "current" : "locked",
    completedAt: null,
  }));
}

export function getRequiredServiceVisitSteps(tasks: ServiceVisitTasks) {
  return SERVICE_VISIT_STEPS.filter(
    (step) => step.id !== "drink_count" || tasks.drinkCountRequired,
  );
}
