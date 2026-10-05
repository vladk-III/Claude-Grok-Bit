// Runs a crew of agents against the shared conversation and streams events.
import Anthropic from "@anthropic-ai/sdk";
import { newId, type Agent, type ChatMessage, type RunEvent, type RunRequest } from "@crewbit/shared";
import { buildSystemPrompt, buildTranscript } from "./transcript";

const MAX_CONTINUATIONS = 5;

// Models that accept adaptive thinking + effort and server-side fallbacks.
const MODERN_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

export type Emit = (event: RunEvent) => void;

export class Orchestrator {
  constructor(private client: Anthropic) {}

  async run(req: RunRequest, emit: Emit, signal: AbortSignal): Promise<void> {
    const byId = new Map(req.agents.map((a) => [a.id, a]));
    const members = req.crew.agentIds.map((id) => byId.get(id)).filter((a): a is Agent => !!a);
    const synthesizer = req.crew.synthesizerId ? byId.get(req.crew.synthesizerId) : undefined;
    const everyone = synthesizer && !members.includes(synthesizer) ? [...members, synthesizer] : members;
    const history = [...req.history];

    const runTurn = async (agent: Agent, view: ChatMessage[], role: "member" | "synthesizer") => {
      if (signal.aborted) return;
      const msg = await this.agentTurn(
        agent,
        buildSystemPrompt(agent, everyone, req.crew.mode, role),
        buildTranscript(agent, view),
        emit,
        signal,
      );
      history.push(msg);
    };

    if (req.crew.mode === "parallel") {
      const snapshot = [...history];
      await Promise.all(members.map((a) => runTurn(a, snapshot, "member")));
    } else {
      const rounds = req.crew.mode === "roundtable" ? req.crew.rounds : 1;
      for (let r = 0; r < rounds; r++) {
        for (const agent of members) await runTurn(agent, history, "member");
      }
    }

    if (synthesizer) await runTurn(synthesizer, history, "synthesizer");
  }

  /** Stream one agent's reply, emitting events; returns the finished message. */
  private async agentTurn(
    agent: Agent,
    system: string,
    messages: Anthropic.Beta.BetaMessageParam[],
    emit: Emit,
    signal: AbortSignal,
  ): Promise<ChatMessage> {
    const turnId = newId("turn");
    const result: ChatMessage = {
      id: turnId,
      role: "agent",
      agentId: agent.id,
      agentName: agent.name,
      text: "",
      createdAt: Date.now(),
    };
    emit({ type: "turn_start", turnId, agentId: agent.id, agentName: agent.name });

    const modern = MODERN_MODELS.has(agent.model);
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: agent.model,
      max_tokens: 64000,
      system,
      messages: [...messages],
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

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;
    try {
      for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
        const stream = this.client.beta.messages.stream(params, { signal });
        stream.on("contentBlock", (block) => {
          if (block.type === "server_tool_use" && block.name === "web_search") {
            const query = String((block.input as { query?: unknown }).query ?? "");
            if (query) {
              result.searches = [...(result.searches ?? []), query];
              emit({ type: "search", turnId, query });
            }
          }
        });
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") {
            result.text += event.delta.text;
            emit({ type: "text", turnId, text: event.delta.text });
          } else if (event.delta.type === "thinking_delta") {
            emit({ type: "thinking", turnId, text: event.delta.thinking });
          }
        }
        const final = await stream.finalMessage();
        inputTokens +=
          final.usage.input_tokens +
          (final.usage.cache_read_input_tokens ?? 0) +
          (final.usage.cache_creation_input_tokens ?? 0);
        outputTokens += final.usage.output_tokens;
        stopReason = final.stop_reason;

        // A long server-tool turn (web search) can pause; resume it as-is.
        if (final.stop_reason !== "pause_turn") break;
        params.messages = [...params.messages, { role: "assistant", content: final.content }];
      }
      if (stopReason === "refusal") {
        result.error = "This request was declined by the model's safety system.";
        emit({ type: "error", turnId, message: result.error });
      } else if (stopReason === "max_tokens") {
        emit({ type: "error", turnId, message: "Reply was cut off at the output limit." });
      }
    } catch (err) {
      if (!signal.aborted) {
        result.error = describeError(err);
        emit({ type: "error", turnId, message: result.error });
      }
    }
    emit({ type: "turn_end", turnId, stopReason, inputTokens, outputTokens });
    return result;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Invalid Anthropic API key on the server.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API - try again shortly.";
  if (err instanceof Anthropic.BadRequestError) return `Bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
