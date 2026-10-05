import assert from "node:assert/strict";
import { test } from "node:test";
import { blankAgent } from "../presets";
import type { Provider } from "../types";
import type { FetchLike } from "./adapter";
import { listOpenAIModels, openaiTurn } from "./openai";

const provider: Provider = {
  id: "ds",
  name: "DeepSeek",
  kind: "openai-compatible",
  baseUrl: "https://api.example.com/v1/",
  apiKey: "sk-test",
};

function sseResponse(events: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      // Split mid-event to exercise buffering.
      const all = events.map((e) => `data: ${e}\n\n`).join("");
      c.enqueue(enc.encode(all.slice(0, 25)));
      c.enqueue(enc.encode(all.slice(25)));
      c.close();
    },
  });
  return { ok: true, status: 200, body, text: async () => "", json: async () => ({}) };
}

test("streams text and reasoning, and sends a system message", async () => {
  let sent: { url: string; headers?: Record<string, string>; body?: string } | undefined;
  const fetchImpl: FetchLike = async (url, init) => {
    sent = { url, headers: init?.headers, body: init?.body };
    return sseResponse([
      JSON.stringify({ choices: [{ delta: { reasoning_content: "hmm" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }),
      "[DONE]",
    ]);
  };
  let text = "";
  let thinking = "";
  const agent = { ...blankAgent("a"), provider: "ds", model: "deepseek-chat" };
  const result = await openaiTurn({
    agent,
    provider,
    system: "Be brief.",
    messages: [{ role: "user", content: "hi" }],
    fetch: fetchImpl,
    signal: new AbortController().signal,
    onText: (t) => (text += t),
    onThinking: (t) => (thinking += t),
    onSearch: () => {},
  });

  assert.equal(sent?.url, "https://api.example.com/v1/chat/completions");
  assert.equal(sent?.headers?.Authorization, "Bearer sk-test");
  assert.deepEqual(JSON.parse(sent!.body!).messages, [
    { role: "system", content: "Be brief." },
    { role: "user", content: "hi" },
  ]);
  assert.equal(text, "Hello");
  assert.equal(thinking, "hmm");
  assert.deepEqual(result, { stopReason: "stop", inputTokens: 12, outputTokens: 3 });
});

test("turns HTTP errors into readable messages", async () => {
  const fetchImpl: FetchLike = async () => ({
    ok: false,
    status: 401,
    body: null,
    text: async () => JSON.stringify({ error: { message: "Invalid key" } }),
    json: async () => ({}),
  });
  await assert.rejects(
    openaiTurn({
      agent: blankAgent("a"),
      provider,
      system: "",
      messages: [{ role: "user", content: "hi" }],
      fetch: fetchImpl,
      signal: new AbortController().signal,
      onText() {},
      onThinking() {},
      onSearch() {},
    }),
    /DeepSeek error 401: Invalid key \(Check the API key/,
  );
});

test("network failures mention browser restrictions", async () => {
  const fetchImpl: FetchLike = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(listOpenAIModels(fetchImpl, provider), /block requests from browsers/);
});

test("lists models", async () => {
  const fetchImpl: FetchLike = async (url) => {
    assert.equal(url, "https://api.example.com/v1/models");
    return {
      ok: true,
      status: 200,
      body: null,
      text: async () => "",
      json: async () => ({ data: [{ id: "b-model" }, { id: "models/a-model" }] }),
    };
  };
  assert.deepEqual(await listOpenAIModels(fetchImpl, provider), ["a-model", "b-model"]);
});
