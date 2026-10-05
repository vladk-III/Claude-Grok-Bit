// Any OpenAI-compatible `/chat/completions` API: OpenAI, DeepSeek, Gemini,
// OpenRouter, Fireworks, DeepInfra, Groq, Together, Ollama, ...
import type { Provider } from "../types";
import { ProviderError, type FetchLike, type TurnInput, type TurnResult } from "./adapter";
import { sseData } from "./sse";

interface ChunkChoice {
  delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null };
  finish_reason?: string | null;
}
interface Chunk {
  choices?: ChunkChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string };
}

function endpoint(provider: Provider, path: string): string {
  if (!provider.baseUrl) throw new ProviderError(`Set the API URL for ${provider.name} in Settings → Providers.`);
  return provider.baseUrl.replace(/\/+$/, "") + path;
}

function headers(provider: Provider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.apiKey) h.Authorization = `Bearer ${provider.apiKey}`;
  return h;
}

async function request(fetchImpl: FetchLike, provider: Provider, url: string, init: Parameters<FetchLike>[1]) {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ProviderError(
      `Couldn't reach ${provider.name}. Check the URL and your connection. In the web app, some ` +
        "providers block requests from browsers - if so, use the mobile app or a Crewbit server.",
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const raw = await res.text();
      try {
        const j = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
        detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? raw;
      } catch {
        detail = raw;
      }
    } catch {
      /* no body */
    }
    const hint = res.status === 401 || res.status === 403 ? " (Check the API key in Settings → Providers.)" : "";
    throw new ProviderError(`${provider.name} error ${res.status}: ${detail.slice(0, 300)}${hint}`);
  }
  return res;
}

export async function openaiTurn(input: TurnInput): Promise<TurnResult> {
  const { provider, signal } = input;
  const res = await request(input.fetch, provider, endpoint(provider, "/chat/completions"), {
    method: "POST",
    headers: headers(provider),
    signal,
    body: JSON.stringify({
      model: input.agent.model,
      stream: true,
      messages: [{ role: "system", content: input.system }, ...input.messages],
    }),
  });
  if (!res.body) throw new ProviderError(`${provider.name} returned no stream.`);

  const result: TurnResult = { stopReason: null, inputTokens: 0, outputTokens: 0 };
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      continue;
    }
    if (chunk.error) throw new ProviderError(`${provider.name}: ${chunk.error.message ?? "stream error"}`);
    const choice = chunk.choices?.[0];
    const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
    if (reasoning) input.onThinking(reasoning);
    if (choice?.delta?.content) input.onText(choice.delta.content);
    if (choice?.finish_reason) result.stopReason = choice.finish_reason;
    if (chunk.usage) {
      result.inputTokens = chunk.usage.prompt_tokens ?? result.inputTokens;
      result.outputTokens = chunk.usage.completion_tokens ?? result.outputTokens;
    }
  }
  if (result.stopReason === "length") result.stopReason = "max_tokens";
  return result;
}

/** Model ids the provider offers, from its `/models` endpoint. */
export async function listOpenAIModels(fetchImpl: FetchLike, provider: Provider): Promise<string[]> {
  const res = await request(fetchImpl, provider, endpoint(provider, "/models"), { headers: headers(provider) });
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((m) => m.id.replace(/^models\//, "")).sort();
}
