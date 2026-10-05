// Builds the per-agent view of a shared multi-agent conversation.
import type { Agent, ChatMessage, CrewMode } from "../types";

type Role = "user" | "assistant";

export interface TranscriptTurn {
  role: Role;
  content: string;
}

/**
 * Turn the shared history into a Messages API transcript from one agent's
 * point of view: its own past replies are `assistant` turns; the user's
 * messages and every other agent's replies are `user` turns, with other
 * agents labelled by name. Consecutive same-role turns are merged so roles
 * alternate, and the transcript always starts and ends on a user turn.
 */
export function buildTranscript(
  agent: Agent,
  history: ChatMessage[],
): TranscriptTurn[] {
  const turns: { role: Role; text: string }[] = [];

  for (const msg of history) {
    if (!msg.text.trim()) continue;
    let role: Role;
    let text: string;
    if (msg.role === "user") {
      role = "user";
      text = msg.text;
    } else if (msg.agentId === agent.id) {
      role = "assistant";
      text = msg.text;
    } else {
      role = "user";
      text = `[${msg.agentName ?? "Another agent"}]:\n${msg.text}`;
    }
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text += `\n\n${text}`;
    else turns.push({ role, text });
  }

  if (turns.length === 0 || turns[0].role !== "user") {
    turns.unshift({ role: "user", text: "(The conversation starts here.)" });
  }
  if (turns[turns.length - 1].role !== "user") {
    turns.push({ role: "user", text: "(Continue the discussion with your next contribution.)" });
  }
  return turns.map((t) => ({ role: t.role, content: t.text }));
}

/** System prompt for one agent, including crew context when others take part. */
export function buildSystemPrompt(
  agent: Agent,
  crewAgents: Agent[],
  mode: CrewMode,
  role: "member" | "synthesizer",
): string {
  const others = crewAgents.filter((a) => a.id !== agent.id);
  if (others.length === 0 && role === "member") return agent.systemPrompt;

  const roster = others
    .map((a) => `- ${a.name}${a.tagline ? `: ${a.tagline}` : ""}`)
    .join("\n");
  const lines = [
    agent.systemPrompt,
    "",
    "## Crew context",
    `You are ${agent.name}, one of several AI agents answering the same user together.`,
    "Other agents in this conversation:",
    roster,
    "Their messages appear in user turns, prefixed with their name in brackets, e.g. [Name]:. " +
      "Do not prefix your own reply with your name.",
  ];
  if (role === "synthesizer") {
    lines.push(
      "Every agent has now contributed. Your job is to write the final answer for the user, " +
        "drawing on and reconciling their contributions.",
    );
  } else if (mode === "parallel") {
    lines.push("Each agent answers independently; you will not see the others' answers to this message.");
  } else {
    lines.push(
      "Agents reply in turn. Build on what has already been said: add something new, correct " +
        "mistakes, or disagree with reasons. Do not repeat points that were already made.",
    );
  }
  return lines.join("\n");
}
