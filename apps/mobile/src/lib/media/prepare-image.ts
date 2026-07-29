import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

export type PreparedImage = {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type PrepareImageOptions = {
  maxWidth: number;
  compress: number;
  maxBytes: number;
  fileLabel: string;
};

export async function prepareImage(
  sourceUri: string,
  options: PrepareImageOptions,
): Promise<PreparedImage> {
  const sourceInfo = await FileSystem.getInfoAsync(sourceUri);

  if (!sourceInfo.exists) {
    throw new Error(`The captured ${options.fileLabel} could not be found.`);
  }

  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [
      {
        resize: {
          width: options.maxWidth,
        },
      },
    ],
    {
      compress: options.compress,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const preparedInfo = await FileSystem.getInfoAsync(result.uri);

  if (!preparedInfo.exists) {
    throw new Error(
      `The prepared ${options.fileLabel} file could not be found.`,
    );
  }

  const sizeBytes =
    "size" in preparedInfo && typeof preparedInfo.size === "number"
      ? preparedInfo.size
      : null;

  if (sizeBytes === null) {
    throw new Error(
      `Unable to determine the prepared ${options.fileLabel} file size.`,
    );
  }

  if (sizeBytes <= 0) {
    throw new Error(`The prepared ${options.fileLabel} file is empty.`);
  }

  if (sizeBytes > options.maxBytes) {
    const maximumMegabytes = Math.round(
      (options.maxBytes / (1024 * 1024)) * 10,
    ) / 10;

    throw new Error(
      `The prepared ${options.fileLabel} is larger than ${maximumMegabytes} MB.`,
    );
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    sizeBytes,
  };
}