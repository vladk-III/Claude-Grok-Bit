// Claude via the Anthropic SDK.
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type TurnInput, type TurnResult } from "./adapter";

const MAX_CONTINUATIONS = 5;

// Models that accept adaptive thinking + effort and server-side fallbacks.
const MODERN_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

const clients = new Map<string, Anthropic>();

function clientFor(input: TurnInput): Anthropic {
  const key = input.provider.apiKey;
  let client = clients.get(key);
  if (!client) {
    client = new Anthropic({
      // Blank key: the SDK falls back to ANTHROPIC_API_KEY (server only).
      ...(key ? { apiKey: key } : {}),
      // The web and mobile apps call the API directly with the user's own key.
      dangerouslyAllowBrowser: true,
      fetch: input.fetch as unknown as typeof globalThis.fetch,
    });
    clients.set(key, client);
  }
  return client;
}

export async function anthropicTurn(input: TurnInput): Promise<TurnResult> {
  const { agent, signal } = input;
  const modern = MODERN_MODELS.has(agent.model);
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: agent.model,
    max_tokens: 32000,
    system: input.system,
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    // Cache the system prompt + history prefix across turns.
    cache_control: { type: "ephemeral" },
    ...(modern && {
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: agent.effort },
      // On a safety decline, let the API retry on Anthropic's recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }),
    ...(agent.webSearch && {
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    }),
  };

  let client: Anthropic;
  try {
    client = clientFor(input);
  } catch {
    throw new ProviderError(`Add your API key for ${input.provider.name} in Settings → Providers.`);
  }

  const result: TurnResult = { stopReason: null, inputTokens: 0, outputTokens: 0 };
  try {
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const stream = client.beta.messages.stream(params, { signal });
      stream.on("contentBlock", (block) => {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          const query = String((block.input as { query?: unknown }).query ?? "");
          if (query) input.onSearch(query);
        }
      });
      for await (const event of stream) {
        if (event.type !== "content_block_delta") continue;
        if (event.delta.type === "text_delta") input.onText(event.delta.text);
        else if (event.delta.type === "thinking_delta") input.onThinking(event.delta.thinking);
      }
      const final = await stream.finalMessage();
      result.inputTokens +=
        final.usage.input_tokens +
        (final.usage.cache_read_input_tokens ?? 0) +
        (final.usage.cache_creation_input_tokens ?? 0);
      result.outputTokens += final.usage.output_tokens;
      result.stopReason = final.stop_reason;

      // A long server-tool turn (web search) can pause; resume it as-is.
      if (final.stop_reason !== "pause_turn") break;
      params.messages = [...params.messages, { role: "assistant", content: final.content }];
    }
  } catch (err) {
    throw new ProviderError(describeAnthropicError(err, input.provider.name));
  }

  if (result.stopReason === "refusal") {
    throw new ProviderError("This request was declined by the model's safety system.");
  }
  return result;
}

function describeAnthropicError(err: unknown, name: string): string {
  if (err instanceof Anthropic.AuthenticationError) return `${name} rejected the API key - check Settings → Providers.`;
  if (err instanceof Anthropic.PermissionDeniedError) return `${name}: this key can't use that model (${err.message}).`;
  if (err instanceof Anthropic.NotFoundError) return `${name}: model not found (${err.message}).`;
  if (err instanceof Anthropic.RateLimitError) return `${name} rate limit hit - try again shortly.`;
  if (err instanceof Anthropic.BadRequestError) return `${name}: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return `Couldn't reach ${name}. Check your connection.`;
  if (err instanceof Anthropic.APIError) return `${name} error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof Error && /authentication method/i.test(err.message)) {
    return `Add your API key for ${name} in Settings → Providers.`;
  }
  return err instanceof Error ? err.message : String(err);
}
