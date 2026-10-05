// Client helpers used by both the web and mobile apps.
import type { ChatMessage, RunEvent, RunRequest, ServerInfo } from "./types";

/** Minimal fetch shape; satisfied by the browser's fetch and expo/fetch. */
export type FetchLike = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  body: ReadableStream<Uint8Array> | null;
}>;

export interface ConnectionSettings {
  /** Base URL of the Crewbit server; "" means same origin (web). */
  serverUrl: string;
  token: string;
}

function headers(conn: ConnectionSettings): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (conn.token) h.Authorization = `Bearer ${conn.token}`;
  return h;
}

function url(conn: ConnectionSettings, path: string): string {
  return conn.serverUrl.replace(/\/+$/, "") + path;
}

export async function fetchServerInfo(
  fetchImpl: FetchLike,
  conn: ConnectionSettings,
): Promise<ServerInfo> {
  const res = await fetchImpl(url(conn, "/api/info"), { headers: headers(conn) });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return (await res.json()) as ServerInfo;
}

/**
 * POST a run and call onEvent for every server-sent event until the stream ends.
 * Abort with the signal to stop generation.
 */
export async function streamRun(
  fetchImpl: FetchLike,
  conn: ConnectionSettings,
  request: RunRequest,
  onEvent: (event: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetchImpl(url(conn, "/api/run"), {
    method: "POST",
    headers: headers(conn),
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as RunEvent);
      }
    }
  }
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
          text: "",
          createdAt: Date.now(),
        },
      ];
    case "text":
      return update(messages, event.turnId, (m) => ({ ...m, text: m.text + event.text }));
    case "thinking":
      return update(messages, event.turnId, (m) => ({
        ...m,
        thinking: (m.thinking ?? "") + event.text,
      }));
    case "search":
      return update(messages, event.turnId, (m) => ({
        ...m,
        searches: [...(m.searches ?? []), event.query],
      }));
    case "error":
      if (event.turnId) {
        return update(messages, event.turnId, (m) => ({ ...m, error: event.message }));
      }
      return messages;
    default:
      return messages;
  }
}

function update(
  messages: ChatMessage[],
  id: string,
  fn: (m: ChatMessage) => ChatMessage,
): ChatMessage[] {
  return messages.map((m) => (m.id === id ? fn(m) : m));
}
