import type { Agent, Provider } from "../types";
import type { TranscriptTurn } from "./transcript";

/** Minimal fetch shape; satisfied by the browser's fetch, Node's fetch and expo/fetch. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  body: ReadableStream<Uint8Array> | null;
}>;

export interface TurnInput {
  agent: Agent;
  provider: Provider;
  system: string;
  messages: TranscriptTurn[];
  fetch: FetchLike;
  signal: AbortSignal;
  onText(text: string): void;
  onThinking(text: string): void;
  onSearch(query: string): void;
}

export interface TurnResult {
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** A friendly error for the chat; `message` is shown as-is. */
export class ProviderError extends Error {}
