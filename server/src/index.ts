import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODELS, type RunEvent, type ServerInfo } from "@crewbit/shared";
import { Orchestrator, describeError } from "./orchestrator";
import { runRequestSchema } from "./schema";

const PORT = Number(process.env.PORT ?? 8787);
const ACCESS_TOKEN = process.env.CREWBIT_ACCESS_TOKEN ?? "";

const app = express();
const orchestrator = new Orchestrator(new Anthropic());

app.use(express.json({ limit: "5mb" }));

// The mobile app and Expo web talk to this server cross-origin. Auth is a
// bearer token (no cookies), so a permissive CORS policy is safe.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

function authorized(header: string | undefined): boolean {
  if (!ACCESS_TOKEN) return true;
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(ACCESS_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

app.use("/api", (req, res, next) => {
  if (req.path === "/info" || authorized(req.headers.authorization)) return next();
  res.status(401).json({ error: "Missing or wrong access token." });
});

app.get("/api/info", (_req, res) => {
  const info: ServerInfo = {
    ok: true,
    name: "Crewbit",
    requiresToken: ACCESS_TOKEN !== "",
    models: MODELS,
  };
  res.json(info);
});

app.post("/api/run", async (req, res) => {
  const parsed = runRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const emit = (event: RunEvent) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Stop generating (and billing) as soon as the client disconnects.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    await orchestrator.run(parsed.data, emit, abort.signal);
  } catch (err) {
    emit({ type: "error", message: describeError(err) });
  }
  emit({ type: "done" });
  res.end();
});

// In production, serve the built web app from the same origin.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.listen(PORT, () => {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set - requests to Claude will fail.");
  }
  if (!ACCESS_TOKEN) {
    console.warn("Note: CREWBIT_ACCESS_TOKEN is not set - anyone who can reach this server can use it.");
  }
  console.log(`Crewbit server listening on http://localhost:${PORT}`);
});
