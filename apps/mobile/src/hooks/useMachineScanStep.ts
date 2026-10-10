import { useCallback } from "react";

import { saveServiceVisit } from "../../src/features/service-visit/service-visit.storage";
import {
  type CompleteMachineScanInput,
  type ServiceVisit,
} from "../../src/features/service-visit/service-visit.types";
import { transitionToNextStep } from "../features/service-visit/state/service-visit.transitions";

type Params = {
  activeVisit: ServiceVisit | null;
  setActiveVisit: (visit: ServiceVisit) => void;
  clearError: () => void;
};

export function useMachineScanStep({
  activeVisit,
  setActiveVisit,
  clearError,
}: Params) {
  const completeMachineScan = useCallback(
    async (input: CompleteMachineScanInput): Promise<ServiceVisit> => {
      if (!activeVisit) {
        throw new Error("There is no active service visit.");
      }

      if (activeVisit.currentStep !== "machine_scan") {
        throw new Error(
          "Machine scanning can only be completed during Step 2.",
        );
      }

      const scannedValue = input.scannedValue.trim();

      if (!scannedValue) {
        throw new Error("The scanned QR code is empty.");
      }

      const expectedQrCode = activeVisit.machineTarget.qrCode.trim();

      if (!expectedQrCode) {
        throw new Error("The assigned machine has no valid QR code.");
      }

      if (scannedValue !== expectedQrCode) {
        throw new Error(
          "This QR code belongs to a different machine. Scan the machine assigned to this stop.",
        );
      }

      const now = new Date().toISOString();

      const visitWithScan: ServiceVisit = {
        ...activeVisit,
        machineScanVerification: {
          scannedValue,
          expectedQrCode,
          machineId: activeVisit.machineTarget.id,
          verifiedAt: now,
        },
      };

      const updatedVisit = transitionToNextStep(
        visitWithScan,
        "machine_scan",
        now,
      );

      await saveServiceVisit(updatedVisit);

      setActiveVisit(updatedVisit);
      clearError();

      return updatedVisit;
    },
    [activeVisit, clearError, setActiveVisit],
  );

  return {
    completeMachineScan,
  };
}
