// Talking to an optional Crewbit server, and folding run events into messages.
import type { FetchLike } from "./engine/adapter";
import { sseData } from "./engine/sse";
import type { ChatMessage, RunEvent, RunRequest, ServerInfo } from "./types";

export interface ServerSettings {
  /** Base URL of the Crewbit server, e.g. http://192.168.1.20:8787. */
  url: string;
  token: string;
}

function headers(server: ServerSettings): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (server.token) h.Authorization = `Bearer ${server.token}`;
  return h;
}

function url(server: ServerSettings, path: string): string {
  return server.url.replace(/\/+$/, "") + path;
}

export async function fetchServerInfo(fetchImpl: FetchLike, server: ServerSettings): Promise<ServerInfo> {
  const res = await fetchImpl(url(server, "/api/info"), { headers: headers(server) });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as ServerInfo;
}

/** Run on a Crewbit server, calling onEvent for every event until the stream ends. */
export async function runOnServer(
  fetchImpl: FetchLike,
  server: ServerSettings,
  request: RunRequest,
  onEvent: (event: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetchImpl(url(server, "/api/run"), {
    method: "POST",
    headers: headers(server),
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* body was not JSON */
    }
    throw new Error(detail || `Server responded ${res.status}`);
  }
  for await (const data of sseData(res.body)) onEvent(JSON.parse(data) as RunEvent);
}

/**
 * Apply a run event to a message list, returning a new list. Each agent turn
 * becomes its own message, keyed by turnId.
 */
export function applyRunEvent(messages: ChatMessage[], event: RunEvent): ChatMessage[] {
  switch (event.type) {
    case "turn_start":
      return [
        ...messages,
        {
          id: event.turnId,
          role: "agent",
          agentId: event.agentId,
          agentName: event.agentName,
          model: event.model,
          text: "",
          createdAt: Date.now(),
        },
      ];
    case "text":
      return update(messages, event.turnId, (m) => ({ ...m, text: m.text + event.text }));
    case "thinking":
      return update(messages, event.turnId, (m) => ({ ...m, thinking: (m.thinking ?? "") + event.text }));
    case "search":
      return update(messages, event.turnId, (m) => ({ ...m, searches: [...(m.searches ?? []), event.query] }));
    case "turn_end":
      return update(messages, event.turnId, (m) => ({
        ...m,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
      }));
    case "error":
      return event.turnId ? update(messages, event.turnId, (m) => ({ ...m, error: event.message })) : messages;
    default:
      return messages;
  }
}

function update(messages: ChatMessage[], id: string, fn: (m: ChatMessage) => ChatMessage): ChatMessage[] {
  return messages.map((m) => (m.id === id ? fn(m) : m));
}
