import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import express from "express";
import { extractSSCCsFromImage } from "./ocr";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post(
    "/api/ocr",
    express.json({ limit: "10mb" }),
    async (req: Request, res: Response) => {
      try {
        const { image } = req.body;
        if (!image) {
          return res.status(400).json({ error: "Image data (base64) is required" });
        }
        const ssccs = await extractSSCCsFromImage(image);
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
