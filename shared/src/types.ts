// Types shared by the engine, the server, the web app and the mobile app.

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * How requests are sent to a provider.
 * - anthropic:          the Claude API (via the Anthropic SDK)
 * - openai-compatible:  any `/chat/completions` API - OpenAI, DeepSeek,
 *                       Gemini, OpenRouter, Fireworks, Groq, Ollama, ...
 */
export type ProviderKind = "anthropic" | "openai-compatible";

/** An AI provider the user has configured, with their own API key. */
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  /** API root, e.g. https://api.deepseek.com/v1. Unused for anthropic. */
  baseUrl: string;
  /** Kept on the device only - never synced to GitHub. */
  apiKey: string;
}

/** One persona: a system prompt plus model settings. */
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Short one-line description shown in pickers. */
  tagline: string;
  systemPrompt: string;
  /** Provider id; see Provider. */
  provider: string;
  /** Model id as the provider names it, e.g. claude-opus-5-5. */
  model: string;
  /** Thinking effort (Claude models only). */
  effort: Effort;
  /** Let the agent search the web (Claude models only). */
  webSearch: boolean;
}

/**
 * How a crew's agents take turns on each user message.
 * - parallel:   everyone answers the user independently, at the same time.
 * - relay:      agents answer one after another, each seeing earlier answers.
 * - roundtable: like relay, repeated for several rounds - a discussion/debate.
 */
export type CrewMode = "parallel" | "relay" | "roundtable";

export interface Crew {
  id: string;
  name: string;
  agentIds: string[];
  mode: CrewMode;
  /** Number of rounds for roundtable mode (1-5). */
  rounds: number;
  /** Optional agent that reads everything and writes a final answer. */
  synthesizerId?: string;
}

/** One message in a conversation. Agent messages carry the agent id. */
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  /** Name snapshot, so transcripts still read well if the agent is deleted. */
  agentName?: string;
  /** Model snapshot, for the record. */
  model?: string;
  text: string;
  thinking?: string;
  searches?: string[];
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  crewId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** Everything needed to run one user message through a crew. */
export interface RunRequest {
  /** Agents taking part. Sent in full so the runner stays stateless. */
  agents: Agent[];
  /** Providers those agents use (keys may be blank when a server fills them in). */
  providers: Provider[];
  crew: Pick<Crew, "agentIds" | "mode" | "rounds" | "synthesizerId">;
  /** Full history, ending with the new user message. */
  history: ChatMessage[];
}

/** Events emitted while a run streams. */
export type RunEvent =
  | { type: "turn_start"; turnId: string; agentId: string; agentName: string; model: string }
  | { type: "text"; turnId: string; text: string }
  | { type: "thinking"; turnId: string; text: string }
  | { type: "search"; turnId: string; query: string }
  | {
      type: "turn_end";
      turnId: string;
      stopReason: string | null;
      inputTokens: number;
      outputTokens: number;
    }
  | { type: "error"; turnId?: string; message: string }
  | { type: "done" };

export interface ServerInfo {
  ok: true;
  name: string;
  requiresToken: boolean;
  /** Provider kinds the server has its own keys for. */
  serverKeys: ProviderKind[];
}
