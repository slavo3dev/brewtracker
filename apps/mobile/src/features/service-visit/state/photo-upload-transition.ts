type PhotoUploadStatus = "pending_upload" | "uploading" | "uploaded" | "failed";

export class PhotoUploadUpdateRejectedError extends Error {
  constructor() {
    super(
      "The photo upload update was rejected because it is no longer current.",
    );
    this.name = "PhotoUploadUpdateRejectedError";
  }
}

export function canApplyPhotoUploadUpdate(
  currentStatus: PhotoUploadStatus,
  nextStatus: PhotoUploadStatus,
): boolean {
  // Upload claims are handled separately.
  if (nextStatus === "uploading") {
    return false;
  }

  // Never downgrade a successfully uploaded photo.
  if (currentStatus === "uploaded") {
    return false;
  }

  // Only an active upload can report success or failure.
  if (nextStatus === "uploaded" || nextStatus === "failed") {
    return currentStatus === "uploading";
  }

  return false;
}
