import { extractSSCCsFromText } from "@/lib/ocr-utils";

export interface OCRImageInput {
  uri?: string;
  base64?: string;
}

export async function extractSSCCsOnDevice(
  image: OCRImageInput
): Promise<string[]> {
  const { uri, base64 } = image;
  if (!uri && !base64) {
    throw new Error("No image data found for OCR.");
  }

  try {
    const { getTextFromFrame } = await import("expo-text-recognition");
    const lines = uri
      ? await getTextFromFrame(uri)
      : await getTextFromFrame(base64 as string, true);

    return extractSSCCsFromText(lines.join(" "));
  } catch {
    throw new Error(
      "On-device OCR is unavailable in this build. Enable manual-only mode to work fully offline."
    );
  }
}
