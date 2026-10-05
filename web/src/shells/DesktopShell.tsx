import { useState } from "react";
import type { CrewbitState } from "@crewbit/shared/react";
import { AgentsView } from "../components/AgentsView";
import { ChatView } from "../components/ChatView";
import { CrewsView } from "../components/CrewsView";
import { SettingsView } from "../components/SettingsView";
import { SyncBadge, type Tab } from "./common";

/** Sidebar layout for computers and tablets. */
export function DesktopShell({ app }: { app: CrewbitState }) {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">⚡</span> Crewbit
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            app.newConversation();
            setTab("chat");
          }}
        >
          + New chat
        </button>
        <nav className="conv-list">
          {app.conversations.length === 0 && <p className="muted small">No chats yet.</p>}
          {app.conversations.map((c) => (
            <div
              key={c.id}
              className={`conv ${c.id === app.active?.id && tab === "chat" ? "active" : ""}`}
              onClick={() => {
                app.selectConversation(c.id);
                setTab("chat");
              }}
            >
              <span className="conv-title">{c.title}</span>
              <button
                className="icon-btn"
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${c.title}"?`)) app.deleteConversation(c.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        <SyncBadge app={app} />
        <div className="side-nav">
          <button className={tab === "agents" ? "active" : ""} onClick={() => setTab("agents")}>
            🤖 Agents
          </button>
          <button className={tab === "crews" ? "active" : ""} onClick={() => setTab("crews")}>
            👥 Crews
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
            ⚙️ Settings
          </button>
        </div>
      </aside>

      <main className="main">
        {tab === "chat" && <ChatView app={app} onOpenSettings={() => setTab("settings")} />}
        {tab === "agents" && <AgentsView app={app} />}
        {tab === "crews" && <CrewsView app={app} />}
        {tab === "settings" && <SettingsView app={app} />}
      </main>
    </div>
  );
}
