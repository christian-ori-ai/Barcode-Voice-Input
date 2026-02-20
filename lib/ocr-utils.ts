import { calculateSSCCCheckDigit } from "@/lib/code128";

const DIGIT_RUN_REGEX = /\d+/g;
const DIGIT_JOINER_REGEX = /(\d)[\s\-()]+(?=\d)/g;

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

export function extractSSCCsFromText(rawText: string): string[] {
  if (!rawText.trim()) return [];

  const textVariants = [rawText, rawText.replace(DIGIT_JOINER_REGEX, "$1")];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const text of textVariants) {
    const digitRuns = text.match(DIGIT_RUN_REGEX) ?? [];

    for (const run of digitRuns) {
      const normalized = normalizeCandidate(run);
      if (!normalized || seen.has(normalized)) continue;

      seen.add(normalized);
      candidates.push(normalized);
    }
  }

  if (candidates.length === 0) return [];

  const valid = candidates.filter(hasValidCheckDigit);
  return valid.length > 0 ? valid : candidates;
}
