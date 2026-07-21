import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

const MAX_SELFIE_BYTES = 2 * 1024 * 1024;

export type PreparedSelfie = {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export async function prepareSelfie(
  sourceUri: string,
): Promise<PreparedSelfie> {
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [
      {
        resize: {
          width: 1080,
        },
      },
    ],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const fileInfo = await FileSystem.getInfoAsync(result.uri);

  if (!fileInfo.exists) {
    throw new Error("The prepared selfie file could not be found.");
  }

  if (
    !("size" in fileInfo) ||
    typeof fileInfo.size !== "number"
  ) {
    throw new Error(
      "The prepared selfie file size could not be determined.",
    );
  }

  if (fileInfo.size <= 0) {
    throw new Error("The prepared selfie file is empty.");
  }

  if (fileInfo.size > MAX_SELFIE_BYTES) {
    throw new Error(
      "The selfie is still too large to upload. Please retake it.",
    );
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    sizeBytes: fileInfo.size,
  };
}