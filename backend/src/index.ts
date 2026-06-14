import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import libraryRoutes from "./routes/library.routes.js";
import learningRoutes from "./routes/learning.routes.js";
import personaRoutes from "./routes/persona.routes.js";
import aiTestRoutes from "./routes/ai-test.routes.js";
import replyRoutes from "./routes/reply.routes.js";
import replyTestRoutes from "./routes/reply-test.routes.js";
import searchRoutes from "./routes/search.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import knowledgeImportRoutes from "./routes/knowledge-import.routes.js";
import keywordMappingRoutes from "./routes/keywordMapping.routes.js";
import { seedPresetCategories } from "./services/library.service.js";
import { sendError, sendSuccess } from "./utils/response.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

// Seed preset knowledge categories into CSV storage on first run
seedPresetCategories().catch((err) => console.warn("Failed to seed preset categories:", err));

app.use(
  cors({
    origin: frontendOrigin,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  sendSuccess(res, { status: "ok" });
});

app.use("/api/learning", learningRoutes);
app.use("/api/learning", uploadRoutes);
app.use("/api/review-items", reviewRoutes);
app.use("/api/libraries", libraryRoutes);
app.use("/api/personas", personaRoutes);
app.use("/api/ai", aiTestRoutes);
app.use("/api/reply", replyRoutes);
app.use("/api/reply-test", replyTestRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/knowledge-import", knowledgeImportRoutes);
app.use("/api/keyword-mappings", keywordMappingRoutes);

app.use((_req, res) => {
  sendError(res, 404, "API not found");
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Internal server error";
  const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) : 500;
  sendError(res, Number.isFinite(status) ? status : 500, message);
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});
