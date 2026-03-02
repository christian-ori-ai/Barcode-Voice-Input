import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import express from "express";
import { extractSSCCsFromImage } from "./ocr";

const OCR_RATE_LIMIT_WINDOW_MS = 60_000;
const OCR_RATE_LIMIT_MAX_REQUESTS = 20;
const OCR_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const OCR_MAX_BASE64_LENGTH = Math.ceil((OCR_MAX_IMAGE_BYTES * 4) / 3) + 4;
const BASE64_IMAGE_PREFIX_REGEX = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;
const BASE64_CHARS_REGEX = /^[A-Za-z0-9+/=]+$/;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const ocrRateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientIp(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneExpiredOcrBuckets(now: number): void {
  for (const [ip, bucket] of ocrRateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      ocrRateLimitBuckets.delete(ip);
    }
  }
}

function checkOcrRateLimit(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  pruneExpiredOcrBuckets(now);

  const existing = ocrRateLimitBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    ocrRateLimitBuckets.set(ip, {
      count: 1,
      resetAt: now + OCR_RATE_LIMIT_WINDOW_MS,
    });
    return { limited: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > OCR_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = Math.max(0, existing.resetAt - now);
    return {
      limited: true,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

function normalizeBase64Image(image: unknown): string | null {
  if (typeof image !== "string") return null;

  const trimmed = image.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(BASE64_IMAGE_PREFIX_REGEX, "");
  const compact = withoutPrefix.replace(/\s+/g, "");

  if (!compact || compact.length > OCR_MAX_BASE64_LENGTH) return null;
  if (!BASE64_CHARS_REGEX.test(compact)) return null;

  return compact;
}

function isBase64ImageSizeAllowed(base64Image: string): boolean {
  const sizeInBytes = Buffer.byteLength(base64Image, "base64");
  return sizeInBytes > 0 && sizeInBytes <= OCR_MAX_IMAGE_BYTES;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post(
    "/api/ocr",
    express.json({ limit: "10mb" }),
    async (req: Request, res: Response) => {
      try {
        const rateLimit = checkOcrRateLimit(getClientIp(req));
        if (rateLimit.limited) {
          res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
          return res.status(429).json({
            error: "Too many OCR requests. Please retry shortly.",
          });
        }

        if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
          return res.status(400).json({ error: "Invalid request body" });
        }

        const base64Image = normalizeBase64Image((req.body as { image?: unknown }).image);
        if (!base64Image) {
          return res
            .status(400)
            .json({ error: "Image data (base64) is required and must be valid" });
        }

        if (!isBase64ImageSizeAllowed(base64Image)) {
          return res.status(413).json({ error: "Image is too large" });
        }

        const ssccs = await extractSSCCsFromImage(base64Image);
        res.json({ ssccs });
      } catch (error) {
        console.error("OCR error:", error);
        res.status(500).json({ error: "Failed to process image" });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
