import {
  prepareImage,
  type PreparedImage,
} from "../../lib/media/prepare-image";

const SELFIE_MAX_WIDTH = 1080;
const SELFIE_COMPRESSION = 0.6;
const SELFIE_MAX_BYTES = 2 * 1024 * 1024;

export type PreparedSelfie = PreparedImage;

export async function prepareSelfie(
  sourceUri: string,
): Promise<PreparedSelfie> {
  return prepareImage(sourceUri, {
    maxWidth: SELFIE_MAX_WIDTH,
    compress: SELFIE_COMPRESSION,
    maxBytes: SELFIE_MAX_BYTES,
    fileLabel: "selfie",
  });
}