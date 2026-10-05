// Optional Crewbit server. The web and mobile apps can call AI providers
// directly with the user's own keys; this server is for when you'd rather
// keep keys on a machine you control, or a provider blocks browser requests.
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROVIDER_TEMPLATES,
  runCrew,
  type FetchLike,
  type Provider,
  type ProviderKind,
  type RunEvent,
  type ServerInfo,
} from "@crewbit/shared";
import { runRequestSchema } from "./schema";

const PORT = Number(process.env.PORT ?? 8787);
const ACCESS_TOKEN = process.env.CREWBIT_ACCESS_TOKEN ?? "";

/**
 * Server-held keys, by provider template id: ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, ...
 */
function serverKey(templateId: string): string {
  return process.env[`${templateId.toUpperCase()}_API_KEY`] ?? "";
}

/**
 * Fill blank keys from the server's environment. A server key is only used
 * with its provider's official URL, so a client can't redirect it elsewhere.
 */
function withServerKeys(providers: Provider[]): Provider[] {
  return providers.map((p) => {
    if (p.apiKey) return p;
    const template = PROVIDER_TEMPLATES.find(
      (t) => t.kind === p.kind && (p.kind === "anthropic" ? t.id === "anthropic" : t.baseUrl === p.baseUrl.replace(/\/+$/, "")),
    );
    return template ? { ...p, apiKey: serverKey(template.id) } : p;
  });
}

const app = express();
app.use(express.json({ limit: "5mb" }));

// The apps talk to this server cross-origin. Auth is a bearer token (no
// cookies), so a permissive CORS policy is safe.
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
  const kinds = new Set<ProviderKind>();
  for (const t of PROVIDER_TEMPLATES) if (serverKey(t.id)) kinds.add(t.kind);
  const info: ServerInfo = { ok: true, name: "Crewbit", requiresToken: ACCESS_TOKEN !== "", serverKeys: [...kinds] };
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
    const request = { ...parsed.data, providers: withServerKeys(parsed.data.providers) };
    await runCrew(request, emit, abort.signal, fetch as unknown as FetchLike);
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
  emit({ type: "done" });
  res.end();
});

// Serve the built web app from the same origin, if it has been built.
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.listen(PORT, () => {
  if (!ACCESS_TOKEN) {
    console.warn("Note: CREWBIT_ACCESS_TOKEN is not set - anyone who can reach this server can use it.");
  }
  console.log(`Crewbit server listening on http://localhost:${PORT}`);
});
