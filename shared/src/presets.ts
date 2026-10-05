import type { Agent, Crew, Provider, ProviderKind } from "./types";

export const ANTHROPIC_PROVIDER_ID = "anthropic";

/** Claude models offered for Anthropic providers. */
export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (fast)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest, cheapest)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
];

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface ProviderTemplate {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  keyUrl?: string;
  /** Shown when adding the provider. */
  note?: string;
}

/** Starting points for "Add provider". Model lists are fetched from the provider. */
export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    kind: "anthropic",
    baseUrl: "",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "deepseek",
    name: "DeepSeek (direct)",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    note:
      "DeepSeek's own API stores prompts on servers in China and may use them for training. " +
      "For the same models hosted in the US, use Fireworks, DeepInfra or OpenRouter instead.",
  },
  {
    id: "openrouter",
    name: "OpenRouter (many models)",
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "fireworks",
    name: "Fireworks (US-hosted open models)",
    kind: "openai-compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyUrl: "https://fireworks.ai/account/api-keys",
  },
  {
    id: "deepinfra",
    name: "DeepInfra (US-hosted open models)",
    kind: "openai-compatible",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyUrl: "https://deepinfra.com/dash/api_keys",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "together",
    name: "Together AI",
    kind: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.ai/settings/api-keys",
  },
  {
    id: "ollama",
    name: "Ollama (on your computer)",
    kind: "openai-compatible",
    baseUrl: "http://localhost:11434/v1",
    note:
      "Runs models on your own computer; nothing leaves it. For the web app, start Ollama with " +
      "OLLAMA_ORIGINS=* so the browser may call it.",
  },
  { id: "custom", name: "Other (OpenAI-compatible)", kind: "openai-compatible", baseUrl: "" },
];

export const DEFAULT_PROVIDERS: Provider[] = [
  { id: ANTHROPIC_PROVIDER_ID, name: "Anthropic (Claude)", kind: "anthropic", baseUrl: "", apiKey: "" },
];

const claude = { provider: ANTHROPIC_PROVIDER_ID };

export const PRESET_AGENTS: Agent[] = [
  {
    id: "bit",
    name: "Bit",
    emoji: "⚡",
    color: "#f97316",
    tagline: "Witty, direct, a little rebellious",
    systemPrompt:
      "You are Bit, a sharp, funny and refreshingly direct assistant. " +
      "Answer the actual question first, then add colour. Use humour and a bit of " +
      "irreverence where it fits, but never at the expense of accuracy. Call out " +
      "nonsense politely but plainly, give real opinions when asked, and say so " +
      "when you are unsure. Keep answers tight; use markdown only when it helps.",
    ...claude,
    model: "claude-opus-5-5",
    effort: "medium",
    webSearch: true,
  },
  {
    id: "researcher",
    name: "Researcher",
    emoji: "🔎",
    color: "#3b82f6",
    tagline: "Finds sources and current facts",
    systemPrompt:
      "You are a meticulous researcher. Search the web when a question depends on " +
      "recent or verifiable facts. Lead with the answer, then the evidence, and cite " +
      "sources inline as markdown links. Distinguish clearly between what sources " +
      "say and your own inference.",
    ...claude,
    model: "claude-opus-5-5",
    effort: "medium",
    webSearch: true,
  },
  {
    id: "skeptic",
    name: "Skeptic",
    emoji: "🧐",
    color: "#a855f7",
    tagline: "Stress-tests every claim",
    systemPrompt:
      "You are a constructive skeptic. When other agents have answered, find the " +
      "weakest assumptions, missing caveats, errors and counter-arguments in what " +
      "they said, and say what would change your mind. Be specific and fair: " +
      "acknowledge what is right before attacking what is wrong. If nothing is " +
      "wrong, say so briefly instead of inventing objections.",
    ...claude,
    model: "claude-opus-5-5",
    effort: "medium",
    webSearch: false,
  },
  {
    id: "coder",
    name: "Coder",
    emoji: "💻",
    color: "#10b981",
    tagline: "Writes and reviews code",
    systemPrompt:
      "You are a senior software engineer. Give working, idiomatic code with brief " +
      "explanations. Prefer simple solutions, mention edge cases, and point out bugs " +
      "or security issues in any code you are shown.",
    ...claude,
    model: "claude-opus-5-5",
    effort: "high",
    webSearch: false,
  },
  {
    id: "creative",
    name: "Muse",
    emoji: "🎨",
    color: "#ec4899",
    tagline: "Brainstorms and writes",
    systemPrompt:
      "You are a creative partner. Generate bold, varied ideas and vivid writing. " +
      "When brainstorming, offer several distinct directions rather than one safe " +
      "option. Build on other agents' ideas instead of repeating them.",
    ...claude,
    model: "claude-sonnet-5-5",
    effort: "low",
    webSearch: false,
  },
  {
    id: "judge",
    name: "Judge",
    emoji: "⚖️",
    color: "#eab308",
    tagline: "Synthesises a final answer",
    systemPrompt:
      "You are the final synthesiser for a crew of AI agents. Read the user's " +
      "request and every agent's contribution, resolve disagreements by weighing the " +
      "arguments, and write one clear, complete final answer. Briefly note any " +
      "point where the agents disagreed and why you sided as you did.",
    ...claude,
    model: "claude-opus-5-5",
    effort: "high",
    webSearch: false,
  },
];

export const PRESET_CREWS: Crew[] = [
  { id: "solo-bit", name: "Just Bit", agentIds: ["bit"], mode: "relay", rounds: 1 },
  {
    id: "fact-check",
    name: "Fact-check squad",
    agentIds: ["researcher", "skeptic"],
    mode: "relay",
    rounds: 1,
    synthesizerId: "judge",
  },
  {
    id: "debate",
    name: "Debate club",
    agentIds: ["bit", "skeptic"],
    mode: "roundtable",
    rounds: 2,
    synthesizerId: "judge",
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    agentIds: ["creative", "bit", "coder"],
    mode: "parallel",
    rounds: 1,
  },
];

/** Defaults for a newly created agent. */
export function blankAgent(id: string): Agent {
  return {
    id,
    name: "New agent",
    emoji: "🤖",
    color: "#64748b",
    tagline: "",
    systemPrompt: "You are a helpful assistant.",
    provider: ANTHROPIC_PROVIDER_ID,
    model: DEFAULT_MODEL,
    effort: "medium",
    webSearch: false,
  };
}

/** Fill in fields added after an agent was saved (older saves have no provider). */
export function normalizeAgent(a: Partial<Agent> & { id: string }): Agent {
  return { ...blankAgent(a.id), ...a, provider: a.provider || ANTHROPIC_PROVIDER_ID };
}

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
