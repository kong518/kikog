import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import fs from "fs/promises";
import fsSync from "fs";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

// Initialize Firebase Admin lazily
let db: admin.firestore.Firestore | null = null;
function getDb() {
  if (!db) {
    let databaseId: string | undefined = undefined;
    try {
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      const configRaw = fsSync.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configRaw);
      
      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: config.projectId
        });
      }
      databaseId = config.firestoreDatabaseId;
    } catch (e) {
      console.warn("Could not read firebase config for admin initialize, falling back to empty initialization", e);
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
    }

    if (databaseId) {
      try {
        db = getFirestore(admin.app(), databaseId);
      } catch (err) {
        console.warn("getFirestore with custom databaseId failed, fallback to default:", err);
        db = admin.firestore();
      }
    } else {
      db = admin.firestore();
    }
  }
  return db;
}

// Helper to lazily read storage bucket
let storageBucketName = "";
async function getStorageBucket() {
  if (!storageBucketName) {
    try {
      const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
      const configRaw = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configRaw);
      storageBucketName = config.storageBucket;
    } catch (e) {
      console.error("Failed to read firebase config for storage bucket:", e);
      storageBucketName = "gen-lang-client-0366386738.firebasestorage.app"; // fallback
    }
  }
  return admin.storage().bucket(storageBucketName);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Gemini API setup
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Pure AI Analysis Endpoint (Accepts image base64, runs Gemini, and returns JSON metadata)
  app.post("/api/organize", async (req, res) => {
    try {
      const { senderName, image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "사진 데이터가 누락되었습니다." });
      }

      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const prompt = `이 사진은 '${senderName || "임의"}'님이 보낸 서비스 모니터링 사진입니다. 
      제공된 이미지 사진을 직접 분석하여, 사진의 핵심 상황을 10자 내외의 아주 짧은 한 문장(예: 프로그램 참여, 상담 진행, 교육 중 등)으로 요약하고, 해당 활동의 가장 잘 표현하는 적절한 그룹 이름(예: 주간 프로그램, 개인 위생, 식사 지도, 행정 업무 등)을 지정해주세요. 
      반드시 아래 JSON 형식으로만 정확히 대답해주세요: { "analysis": "요약 한문장", "groupName": "그룹이름" }`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          prompt,
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ],
      });

      let rawText = response.text || "";
      let text = rawText.replace(/```json|```/g, "").trim();
      
      let aiResult = { analysis: "", groupName: "기타" };
      try {
        aiResult = JSON.parse(text);
      } catch (e) {
        // Fallback if formatting was loose
        const startIdx = text.indexOf("{");
        const endIdx = text.lastIndexOf("}");
        if (startIdx !== -1 && endIdx !== -1) {
          try {
            aiResult = JSON.parse(text.substring(startIdx, endIdx + 1));
          } catch (innerErr) {
            // Ignore
          }
        }
      }

      res.status(200).json({
        analysis: aiResult.analysis || "요약 불가",
        groupName: aiResult.groupName || "기타"
      });
    } catch (error: any) {
      console.error("Gemini Multi-Modal API error:", error);
      res.status(500).json({ error: "AI 분석 중 오류가 발생했습니다: " + (error.message || error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await fs.readFile(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
