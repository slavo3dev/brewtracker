import {
  prepareImage,
  type PreparedImage,
} from "../../../lib/media/prepare-image";

const SERVICE_PHOTO_MAX_WIDTH = 1600;
const SERVICE_PHOTO_COMPRESSION = 0.75;
const SERVICE_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

export type PreparedServicePhoto = PreparedImage;

export async function prepareServicePhoto(
  sourceUri: string,
): Promise<PreparedServicePhoto> {
  return prepareImage(sourceUri, {
    maxWidth: SERVICE_PHOTO_MAX_WIDTH,
    compress: SERVICE_PHOTO_COMPRESSION,
    maxBytes: SERVICE_PHOTO_MAX_BYTES,
    fileLabel: "service photo",
  });
}