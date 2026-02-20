import { extractSSCCsFromText } from "@/lib/ocr-utils";

export interface OCRImageInput {
  uri?: string;
  base64?: string;
}

function toImageSource(image: OCRImageInput): string | undefined {
  if (image.uri) return image.uri;
  if (image.base64) return `data:image/jpeg;base64,${image.base64}`;
  return undefined;
}

export async function extractSSCCsOnDevice(
  image: OCRImageInput
): Promise<string[]> {
  const imageSource = toImageSource(image);
  if (!imageSource) {
    throw new Error("No image data found for OCR.");
  }

  const tesseractModule = await import("tesseract.js");
  const tesseract =
    "default" in tesseractModule ? tesseractModule.default : tesseractModule;

  const result = await tesseract.recognize(imageSource, "eng");
  return extractSSCCsFromText(result.data?.text ?? "");
}
