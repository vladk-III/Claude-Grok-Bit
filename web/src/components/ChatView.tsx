import { useEffect, useRef, useState } from "react";
import type { CrewbitState } from "@crewbit/shared/react";
import { MessageBubble } from "./MessageBubble";

const MODE_LABEL = { parallel: "all at once", relay: "in turn", roundtable: "roundtable" } as const;

export function ChatView({ app, onOpenSettings }: { app: CrewbitState; onOpenSettings: () => void }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = app.active?.messages ?? [];
  const crew = app.activeCrew;
  const agentsById = new Map(app.agents.map((a) => [a.id, a]));
  // Agent replies after the latest user message belong to the run in progress.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  // Providers this crew needs that have no API key yet (direct mode only).
  const crewAgentIds = new Set([...(crew?.agentIds ?? []), ...(crew?.synthesizerId ? [crew.synthesizerId] : [])]);
  const missingKeys =
    app.runMode === "direct"
      ? app.providers.filter(
          (p) => !p.apiKey && p.baseUrl.indexOf("localhost") === -1 && app.agents.some((a) => crewAgentIds.has(a.id) && a.provider === p.id),
        )
      : [];

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    if (!draft.trim() || app.running) return;
    void app.send(draft);
    setDraft("");
  };

  const pickCrew = (crewId: string) => {
    if (app.active) app.setConversationCrew(app.active.id, crewId);
    else app.newConversation(crewId);
  };

  return (
    <div className="chat">
      <div className="crew-bar">
        <label className="muted small">Crew</label>
        <select value={crew?.id ?? ""} onChange={(e) => pickCrew(e.target.value)}>
          {app.crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {crew && (
          <span className="crew-members">
            {crew.agentIds.map((id) => agentsById.get(id)).filter(Boolean).map((a) => (
              <span key={a!.id} className="chip" style={{ borderColor: a!.color }}>
                {a!.emoji} {a!.name}
              </span>
            ))}
            {crew.agentIds.length > 1 && (
              <span className="muted small">
                {MODE_LABEL[crew.mode]}
                {crew.mode === "roundtable" ? ` × ${crew.rounds}` : ""}
              </span>
            )}
            {crew.synthesizerId && agentsById.get(crew.synthesizerId) && (
              <span className="muted small">→ {agentsById.get(crew.synthesizerId)!.name} sums up</span>
            )}
          </span>
        )}
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <div className="empty-mark">⚡</div>
            <h2>What's on your mind?</h2>
            <p className="muted">
              Ask anything. Pick a crew above to have several agents with different personalities
              research, debate and sum up together.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            agent={m.agentId ? agentsById.get(m.agentId) : undefined}
            streaming={app.running && i > lastUserIndex}
          />
        ))}
        {app.running && messages[messages.length - 1]?.role === "user" && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {missingKeys.length > 0 && (
        <div className="banner warn" onClick={onOpenSettings}>
          Add your API key for {missingKeys.map((p) => p.name).join(", ")} in <u>Settings</u> to start chatting.
        </div>
      )}

      {app.error && (
        <div className="banner error" onClick={app.clearError}>
          {app.error} <span className="muted small">(dismiss)</span>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          value={draft}
          rows={1}
          placeholder={`Message ${crew?.name ?? "Crewbit"}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {app.running ? (
          <button type="button" className="btn danger" onClick={app.stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
