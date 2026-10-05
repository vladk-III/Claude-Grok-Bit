// Runs a crew of agents against the shared conversation and emits events.
import { CLAUDE_MODELS, newId } from "../presets";
import type { Agent, ChatMessage, Provider, RunEvent, RunRequest } from "../types";
import { ProviderError, type FetchLike, type TurnInput, type TurnResult } from "./adapter";
import { anthropicTurn } from "./anthropic";
import { listOpenAIModels, openaiTurn } from "./openai";
import { buildSystemPrompt, buildTranscript } from "./transcript";

export type Emit = (event: RunEvent) => void;

export async function runCrew(
  req: RunRequest,
  emit: Emit,
  signal: AbortSignal,
  fetchImpl: FetchLike,
): Promise<void> {
  const byId = new Map(req.agents.map((a) => [a.id, a]));
  const providers = new Map(req.providers.map((p) => [p.id, p]));
  const members = req.crew.agentIds.map((id) => byId.get(id)).filter((a): a is Agent => !!a);
  const synthesizer = req.crew.synthesizerId ? byId.get(req.crew.synthesizerId) : undefined;
  const everyone = synthesizer && !members.includes(synthesizer) ? [...members, synthesizer] : members;
  const history = [...req.history];

  const runTurn = async (agent: Agent, view: ChatMessage[], role: "member" | "synthesizer") => {
    if (signal.aborted) return;
    history.push(
      await agentTurn(
        agent,
        providers.get(agent.provider),
        buildSystemPrompt(agent, everyone, req.crew.mode, role),
        view,
        emit,
        signal,
        fetchImpl,
      ),
    );
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
async function agentTurn(
  agent: Agent,
  provider: Provider | undefined,
  system: string,
  view: ChatMessage[],
  emit: Emit,
  signal: AbortSignal,
  fetchImpl: FetchLike,
): Promise<ChatMessage> {
  const turnId = newId("turn");
  const msg: ChatMessage = {
    id: turnId,
    role: "agent",
    agentId: agent.id,
    agentName: agent.name,
    model: agent.model,
    text: "",
    createdAt: Date.now(),
  };
  emit({ type: "turn_start", turnId, agentId: agent.id, agentName: agent.name, model: agent.model });

  let result: TurnResult = { stopReason: null, inputTokens: 0, outputTokens: 0 };
  try {
    if (!provider) throw new ProviderError(`${agent.name} uses a provider that no longer exists - edit the agent.`);
    const input: TurnInput = {
      agent,
      provider,
      system,
      messages: buildTranscript(agent, view),
      fetch: fetchImpl,
      signal,
      onText: (text) => {
        msg.text += text;
        emit({ type: "text", turnId, text });
      },
      onThinking: (text) => emit({ type: "thinking", turnId, text }),
      onSearch: (query) => {
        msg.searches = [...(msg.searches ?? []), query];
        emit({ type: "search", turnId, query });
      },
    };
    result = provider.kind === "anthropic" ? await anthropicTurn(input) : await openaiTurn(input);
    if (result.stopReason === "max_tokens") {
      emit({ type: "error", turnId, message: "Reply was cut off at the output limit." });
    }
  } catch (err) {
    if (!signal.aborted) {
      msg.error = err instanceof Error ? err.message : String(err);
      emit({ type: "error", turnId, message: msg.error });
    }
  }
  msg.inputTokens = result.inputTokens;
  msg.outputTokens = result.outputTokens;
  emit({ type: "turn_end", turnId, ...result });
  return msg;
}

/** Models to offer for a provider. */
export async function listModels(fetchImpl: FetchLike, provider: Provider): Promise<string[]> {
  if (provider.kind === "anthropic") return CLAUDE_MODELS.map((m) => m.id);
  return listOpenAIModels(fetchImpl, provider);
}
