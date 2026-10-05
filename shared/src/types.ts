// Types shared by the server, the web app and the mobile app.

export type ModelId =
  | "claude-opus-5-5"
  | "claude-sonnet-5-5"
  | "claude-haiku-4-5"
  | "claude-fable-5-1";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** One persona: a system prompt plus model settings. */
export interface Agent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  /** Short one-line description shown in pickers. */
  tagline: string;
  systemPrompt: string;
  model: ModelId;
  effort: Effort;
  /** Let the agent search the web for fresh information. */
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
  text: string;
  thinking?: string;
  searches?: string[];
  error?: string;
  createdAt: number;
}

/** Body of POST /api/run. */
export interface RunRequest {
  /** Agents taking part. Sent in full so the server stays stateless. */
  agents: Agent[];
  crew: Pick<Crew, "agentIds" | "mode" | "rounds" | "synthesizerId">;
  /** Full history, ending with the new user message. */
  history: ChatMessage[];
}

/** Server-sent events emitted while a run streams. */
export type RunEvent =
  | { type: "turn_start"; turnId: string; agentId: string; agentName: string }
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
  models: { id: ModelId; label: string }[];
}
