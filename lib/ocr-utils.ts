import { calculateSSCCCheckDigit } from "@/lib/code128";

const DIGIT_RUN_REGEX = /\d{18,30}/g;
const DIGIT_JOINER_REGEX = /(\d)[\s\-()]+(?=\d)/g;
const OCR_NUMERIC_CHUNK_REGEX = /[\dOQDISBZL|()\-\s]{18,40}/gi;

const OCR_DIGIT_CHAR_MAP: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  "|": "1",
  Z: "2",
  S: "5",
  B: "8",
};

function normalizeCandidate(digits: string): string | null {
  if (digits.length === 18) return digits;
  if (digits.length === 19 || digits.length === 20) {
    return digits.slice(-18);
  }
  if (digits.length > 20) {
    return digits.slice(-18);
  }
  return null;
}

function hasValidCheckDigit(sscc: string): boolean {
  if (!/^\d{18}$/.test(sscc)) return false;
  const expected = calculateSSCCCheckDigit(sscc.slice(0, 17));
  return Number(sscc[17]) === expected;
}

function mapOcrNumericChunk(chunk: string): string {
  const mapped = chunk
    .toUpperCase()
    .replace(/[OQDISBZL|]/g, (char) => OCR_DIGIT_CHAR_MAP[char] ?? char);

  return mapped.replace(DIGIT_JOINER_REGEX, "$1").replace(/\D/g, "");
}

function expandRunToCandidates(run: string): string[] {
  if (run.length < 18) return [];
  if (run.length === 18) return [run];

  const candidates = new Set<string>();

  candidates.add(run.slice(-18));

  if (run.startsWith("00") && run.length >= 20) {
    candidates.add(run.slice(2, 20));
  }

  return [...candidates];
}

function dedupeAndPrioritize(candidates: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  const valid = deduped.filter(hasValidCheckDigit);
  return valid.length > 0 ? valid : deduped;
}

export function normalizeAndValidateSSCCs(rawCandidates: string[]): string[] {
  return dedupeAndPrioritize(rawCandidates);
}

export function extractSSCCsFromText(rawText: string): string[] {
  if (!rawText.trim()) return [];

  const textVariants = [rawText, rawText.replace(DIGIT_JOINER_REGEX, "$1")];
  const candidates: string[] = [];

  for (const text of textVariants) {
    const digitRuns = text.match(DIGIT_RUN_REGEX) ?? [];

    for (const run of digitRuns) {
      candidates.push(...expandRunToCandidates(run));
    }

    const numericChunks = text.match(OCR_NUMERIC_CHUNK_REGEX) ?? [];
    for (const chunk of numericChunks) {
      const normalizedDigits = mapOcrNumericChunk(chunk);
      candidates.push(...expandRunToCandidates(normalizedDigits));
    }
  }

  return dedupeAndPrioritize(candidates);
}
