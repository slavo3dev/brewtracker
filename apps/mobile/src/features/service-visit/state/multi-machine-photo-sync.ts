
import type { MultiMachineServiceVisit } from "../multi-machine-visit.types";

export function hasUnsyncedMachinePhotos(
  visit: MultiMachineServiceVisit,
): boolean {
  return visit.machines.some((machine) => {
    const hasUnsyncedBeforePhotos = machine.beforePhotos.some(
      (photo) => photo.uploadStatus !== "uploaded",
    );

    const afterPhoto = machine.afterService.afterPhoto;

    const hasUnsyncedAfterPhoto =
      afterPhoto !== null &&
      afterPhoto.uploadStatus !== "uploaded";

    return hasUnsyncedBeforePhotos || hasUnsyncedAfterPhoto;
  });
}
