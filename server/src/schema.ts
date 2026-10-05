import { z } from "zod";
import { MODELS, type RunRequest } from "@crewbit/shared";

const modelIds = MODELS.map((m) => m.id) as [string, ...string[]];

const agent = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  emoji: z.string().max(16),
  color: z.string().max(32),
  tagline: z.string().max(200),
  systemPrompt: z.string().max(20_000),
  model: z.enum(modelIds),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  webSearch: z.boolean(),
});

const message = z.object({
  id: z.string().max(100),
  role: z.enum(["user", "agent"]),
  agentId: z.string().max(100).optional(),
  agentName: z.string().max(60).optional(),
  text: z.string().max(200_000),
  thinking: z.string().optional(),
  searches: z.array(z.string()).optional(),
  error: z.string().optional(),
  createdAt: z.number(),
});

export const runRequestSchema = z
  .object({
    agents: z.array(agent).min(1).max(12),
    crew: z.object({
      agentIds: z.array(z.string()).min(1).max(8),
      mode: z.enum(["parallel", "relay", "roundtable"]),
      rounds: z.number().int().min(1).max(5),
      synthesizerId: z.string().optional(),
    }),
    history: z.array(message).min(1).max(500),
  })
  .refine((r) => r.history[r.history.length - 1].role === "user", {
    message: "history must end with a user message",
  })
  .refine(
    (r) => {
      const ids = new Set(r.agents.map((a) => a.id));
      return (
        r.crew.agentIds.every((id) => ids.has(id)) &&
        (!r.crew.synthesizerId || ids.has(r.crew.synthesizerId))
      );
    },
    { message: "crew references an agent that was not sent" },
  ) as unknown as z.ZodType<RunRequest>;
