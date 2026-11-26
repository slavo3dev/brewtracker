
const activeUploads = new Set<string>();

export class PhotoUploadAlreadyRunningError extends Error {
  constructor() {
    super("This photo is already being uploaded.");
    this.name = "PhotoUploadAlreadyRunningError";
  }
}

export async function withPhotoUploadLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (activeUploads.has(key)) {
    throw new PhotoUploadAlreadyRunningError();
  }

  activeUploads.add(key);

  try {
    return await operation();
  } finally {
    activeUploads.delete(key);
  }
}
