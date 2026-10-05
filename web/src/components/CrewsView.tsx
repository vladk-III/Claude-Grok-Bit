import { useState } from "react";
import { newId, type Crew, type CrewMode } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";

const MODES: { id: CrewMode; label: string; help: string }[] = [
  { id: "relay", label: "Relay", help: "Agents answer one after another; each sees what came before." },
  { id: "parallel", label: "Parallel", help: "Everyone answers independently at the same time." },
  { id: "roundtable", label: "Roundtable", help: "Agents discuss in turn for several rounds - great for debates." },
];

export function CrewsView({ app }: { app: CrewbitState }) {
  const [editing, setEditing] = useState<Crew | null>(null);
  const agentsById = new Map(app.agents.map((a) => [a.id, a]));

  if (editing) {
    return (
      <CrewEditor
        app={app}
        initial={editing}
        isNew={!app.crews.some((c) => c.id === editing.id)}
        onDone={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="muted">
          A crew pairs agents together. A single-agent crew is a normal chat bot; add more to get
          multiple perspectives, debate or fact-checking.
        </p>
        <button
          className="btn primary"
          onClick={() =>
            setEditing({ id: newId("crew"), name: "New crew", agentIds: [], mode: "relay", rounds: 2 })
          }
        >
          + New crew
        </button>
      </div>
      <div className="cards">
        {app.crews.map((c) => (
          <button key={c.id} className="card" onClick={() => setEditing(c)}>
            <div>
              <div className="card-title">{c.name}</div>
              <div className="crew-members">
                {c.agentIds.map((id) => agentsById.get(id)).filter(Boolean).map((a) => (
                  <span key={a!.id} className="chip" style={{ borderColor: a!.color }}>
                    {a!.emoji} {a!.name}
                  </span>
                ))}
              </div>
              <div className="muted small">
                {MODES.find((m) => m.id === c.mode)?.label}
                {c.mode === "roundtable" ? ` × ${c.rounds} rounds` : ""}
                {c.synthesizerId && agentsById.get(c.synthesizerId)
                  ? ` · ${agentsById.get(c.synthesizerId)!.name} sums up`
                  : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CrewEditor({
  app,
  initial,
  isNew,
  onDone,
}: {
  app: CrewbitState;
  initial: Crew;
  isNew: boolean;
  onDone: () => void;
}) {
  const [c, setC] = useState(initial);
  const toggle = (id: string) =>
    setC((x) => ({
      ...x,
      agentIds: x.agentIds.includes(id) ? x.agentIds.filter((a) => a !== id) : [...x.agentIds, id],
    }));
  const move = (id: string, dir: -1 | 1) =>
    setC((x) => {
      const ids = [...x.agentIds];
      const i = ids.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return x;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...x, agentIds: ids };
    });

  return (
    <form
      className="page form"
      onSubmit={(e) => {
        e.preventDefault();
        if (c.agentIds.length === 0) return alert("Pick at least one agent.");
        app.saveCrew({ ...c, name: c.name.trim() || "Crew" });
        onDone();
      }}
    >
      <label className="field">
        Name
        <input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} required />
      </label>

      <fieldset className="field">
        <legend>Members (in speaking order)</legend>
        {c.agentIds.map((id, i) => {
          const a = app.agents.find((x) => x.id === id);
          if (!a) return null;
          return (
            <div key={id} className="member-row">
              <span>
                {i + 1}. {a.emoji} {a.name}
              </span>
              <span>
                <button type="button" className="icon-btn" onClick={() => move(id, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" onClick={() => move(id, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn" onClick={() => toggle(id)}>
                  ×
                </button>
              </span>
            </div>
          );
        })}
        <div className="crew-members">
          {app.agents
            .filter((a) => !c.agentIds.includes(a.id))
            .map((a) => (
              <button type="button" key={a.id} className="chip add" onClick={() => toggle(a.id)}>
                + {a.emoji} {a.name}
              </button>
            ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>How they take turns</legend>
        {MODES.map((m) => (
          <label key={m.id} className="check">
            <input type="radio" checked={c.mode === m.id} onChange={() => setC({ ...c, mode: m.id })} />
            <span>
              <strong>{m.label}</strong> <span className="muted small">{m.help}</span>
            </span>
          </label>
        ))}
        {c.mode === "roundtable" && (
          <label className="field narrow">
            Rounds
            <input
              type="number"
              min={1}
              max={5}
              value={c.rounds}
              onChange={(e) => setC({ ...c, rounds: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </label>
        )}
      </fieldset>

      <label className="field">
        Final answer by (optional)
        <select
          value={c.synthesizerId ?? ""}
          onChange={(e) => setC({ ...c, synthesizerId: e.target.value || undefined })}
        >
          <option value="">Nobody - just show each agent's reply</option>
          {app.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emoji} {a.name}
            </option>
          ))}
        </select>
      </label>

      <div className="actions">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        {!isNew && (
          <button
            type="button"
            className="btn danger push"
            onClick={() => {
              if (confirm(`Delete ${c.name}?`)) {
                app.deleteCrew(c.id);
                onDone();
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
