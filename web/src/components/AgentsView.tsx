import { useState } from "react";
import { MODELS, blankAgent, newId, type Agent, type Effort, type ModelId } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function AgentsView({ app }: { app: CrewbitState }) {
  const [editing, setEditing] = useState<Agent | null>(null);

  if (editing) {
    return (
      <AgentEditor
        initial={editing}
        isNew={!app.agents.some((a) => a.id === editing.id)}
        onCancel={() => setEditing(null)}
        onSave={(a) => {
          app.saveAgent(a);
          setEditing(null);
        }}
        onDelete={() => {
          app.deleteAgent(editing.id);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="muted">
          Agents are personas: a system prompt plus a model. Combine them into crews to have them work
          together.
        </p>
        <button className="btn primary" onClick={() => setEditing(blankAgent(newId("agent")))}>
          + New agent
        </button>
      </div>
      <div className="cards">
        {app.agents.map((a) => (
          <button key={a.id} className="card" onClick={() => setEditing(a)}>
            <div className="avatar" style={{ background: a.color }}>
              {a.emoji}
            </div>
            <div>
              <div className="card-title">{a.name}</div>
              <div className="muted small">{a.tagline || a.systemPrompt.slice(0, 80)}</div>
              <div className="muted small">
                {MODELS.find((m) => m.id === a.model)?.label ?? a.model} · effort {a.effort}
                {a.webSearch ? " · web search" : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentEditor({
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Agent;
  isNew: boolean;
  onSave: (a: Agent) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [a, setA] = useState(initial);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setA((x) => ({ ...x, [k]: v }));
  const effortApplies = a.model !== "claude-haiku-4-5";

  return (
    <form
      className="page form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...a, name: a.name.trim() || "Agent" });
      }}
    >
      <div className="row">
        <label className="field narrow">
          Emoji
          <input value={a.emoji} maxLength={4} onChange={(e) => set("emoji", e.target.value)} />
        </label>
        <label className="field">
          Name
          <input value={a.name} maxLength={60} onChange={(e) => set("name", e.target.value)} required />
        </label>
        <label className="field narrow">
          Colour
          <input type="color" value={a.color} onChange={(e) => set("color", e.target.value)} />
        </label>
      </div>
      <label className="field">
        Tagline
        <input
          value={a.tagline}
          maxLength={200}
          placeholder="One line describing this agent"
          onChange={(e) => set("tagline", e.target.value)}
        />
      </label>
      <label className="field">
        System prompt
        <textarea
          rows={10}
          value={a.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          placeholder="Who is this agent, how should it talk, what should it focus on?"
        />
      </label>
      <div className="row">
        <label className="field">
          Model
          <select value={a.model} onChange={(e) => set("model", e.target.value as ModelId)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Effort {effortApplies ? "" : "(not used by Haiku)"}
          <select
            value={a.effort}
            disabled={!effortApplies}
            onChange={(e) => set("effort", e.target.value as Effort)}
          >
            {EFFORTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={a.webSearch} onChange={(e) => set("webSearch", e.target.checked)} />
        Allow web search (for current events and fact-checking)
      </label>
      <div className="actions">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {!isNew && (
          <button
            type="button"
            className="btn danger push"
            onClick={() => confirm(`Delete ${a.name}?`) && onDelete()}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
