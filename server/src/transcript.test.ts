import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESET_AGENTS, type ChatMessage } from "@crewbit/shared";
import { buildSystemPrompt, buildTranscript } from "./transcript";

const [bit, researcher, skeptic] = PRESET_AGENTS;

function msg(role: "user" | "agent", text: string, agentId?: string, agentName?: string): ChatMessage {
  return { id: Math.random().toString(), role, text, agentId, agentName, createdAt: 0 };
}

test("own replies become assistant turns; others are labelled user turns", () => {
  const t = buildTranscript(skeptic, [
    msg("user", "Is coffee healthy?"),
    msg("agent", "Mostly yes.", researcher.id, researcher.name),
    msg("agent", "Depends on dose.", skeptic.id, skeptic.name),
    msg("agent", "Agreed.", bit.id, bit.name),
  ]);
  assert.deepEqual(t, [
    { role: "user", content: "Is coffee healthy?\n\n[Researcher]:\nMostly yes." },
    { role: "assistant", content: "Depends on dose." },
    { role: "user", content: "[Bit]:\nAgreed." },
  ]);
});

test("transcript always ends on a user turn", () => {
  const t = buildTranscript(bit, [msg("user", "hi"), msg("agent", "hello", bit.id, bit.name)]);
  assert.equal(t[t.length - 1].role, "user");
  assert.equal(t.length, 3);
});

test("empty and errored replies are skipped", () => {
  const t = buildTranscript(bit, [msg("user", "hi"), msg("agent", "", skeptic.id, skeptic.name)]);
  assert.deepEqual(t, [{ role: "user", content: "hi" }]);
});

test("solo agents get their plain system prompt", () => {
  assert.equal(buildSystemPrompt(bit, [bit], "relay", "member"), bit.systemPrompt);
});

test("crew members get crew context naming the others", () => {
  const s = buildSystemPrompt(bit, [bit, skeptic], "roundtable", "member");
  assert.match(s, /Skeptic/);
  assert.match(s, /Build on what has already been said/);
});
