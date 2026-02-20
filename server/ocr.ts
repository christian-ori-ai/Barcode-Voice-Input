import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function extractSSCCsFromImage(base64Image: string): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content:
          "You are an OCR specialist that extracts SSCC (Serial Shipping Container Code) numbers from images. SSCCs are 18-digit numeric strings. They may appear as standalone 18-digit numbers, or as 19-20 digit numbers where the first 1-2 digits are a leading extension digit followed by the 18-digit SSCC. They may also be prefixed with 00 or (00). Look for any long numeric strings (18-20 digits) in the image. For each one found: if it is exactly 18 digits, return it as-is. If it is 19 or 20 digits, return only the LAST 18 digits (strip leading digits). Ignore numbers shorter than 18 digits. Return a JSON array of 18-digit strings. If no qualifying numbers are found, return an empty array. Respond ONLY with the JSON array, no other text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all SSCC numbers from this image. Return a JSON array of 18-digit strings.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_completion_tokens: 8192,
  });

  const content = response.choices[0]?.message?.content || "[]";

  try {
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown) => typeof item === "string" && /^\d{18}$/.test(item)
    );
  } catch {
    const digitMatches = content.match(/\d{18}/g);
    return digitMatches || [];
  }
}
