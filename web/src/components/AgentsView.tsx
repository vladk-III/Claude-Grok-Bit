import { useState } from "react";
import { CLAUDE_MODELS, blankAgent, listModels, newId, type Agent, type Effort, type Provider } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function AgentsView({ app }: { app: CrewbitState }) {
  const [editing, setEditing] = useState<Agent | null>(null);

  if (editing) {
    return (
      <AgentEditor
        app={app}
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
                {app.providers.find((p) => p.id === a.provider)?.name ?? "Missing provider"} · {a.model}
                {a.webSearch && isClaude(app.providers, a) ? " · web search" : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function isClaude(providers: Provider[], a: Agent): boolean {
  return providers.find((p) => p.id === a.provider)?.kind === "anthropic";
}

function AgentEditor({
  app,
  initial,
  isNew,
  onSave,
  onCancel,
  onDelete,
}: {
  app: CrewbitState;
  initial: Agent;
  isNew: boolean;
  onSave: (a: Agent) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [a, setA] = useState(initial);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setA((x) => ({ ...x, [k]: v }));
  const provider = app.providers.find((p) => p.id === a.provider);
  const claude = provider?.kind === "anthropic";
  const effortApplies = claude && a.model !== "claude-haiku-4-5";
  const [models, setModels] = useState<string[]>([]);
  const [modelsStatus, setModelsStatus] = useState("");

  const loadModels = async () => {
    if (!provider) return;
    setModelsStatus("Loading…");
    try {
      const list = await listModels(app.fetch, provider);
      setModels(list);
      setModelsStatus(`${list.length} models available - start typing to filter.`);
    } catch (err) {
      setModelsStatus(err instanceof Error ? err.message : String(err));
    }
  };

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
          Provider
          <select
            value={a.provider}
            onChange={(e) => {
              const next = app.providers.find((p) => p.id === e.target.value);
              setModels([]);
              setModelsStatus("");
              setA((x) => ({
                ...x,
                provider: e.target.value,
                model: next?.kind === "anthropic" ? CLAUDE_MODELS[0].id : "",
              }));
            }}
          >
            {!provider && <option value={a.provider}>Missing provider - pick one</option>}
            {app.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Model
          {claude ? (
            <select value={a.model} onChange={(e) => set("model", e.target.value)}>
              {!CLAUDE_MODELS.some((m) => m.id === a.model) && <option value={a.model}>{a.model}</option>}
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="inline">
              <input
                list="model-list"
                value={a.model}
                required
                placeholder="Model id, e.g. from the provider's docs"
                onChange={(e) => set("model", e.target.value)}
              />
              <button type="button" className="btn" onClick={() => void loadModels()}>
                Load list
              </button>
              <datalist id="model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </span>
          )}
          {modelsStatus && <span className="small">{modelsStatus}</span>}
        </label>
      </div>
      {effortApplies && (
        <label className="field">
          Effort (how hard it thinks; higher is slower and costs more)
          <select value={a.effort} onChange={(e) => set("effort", e.target.value as Effort)}>
            {EFFORTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      )}
      {claude ? (
        <label className="check">
          <input type="checkbox" checked={a.webSearch} onChange={(e) => set("webSearch", e.target.checked)} />
          Allow web search (for current events and fact-checking)
        </label>
      ) : (
        <p className="note">Web search and thinking effort are available for Claude agents only.</p>
      )}
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
