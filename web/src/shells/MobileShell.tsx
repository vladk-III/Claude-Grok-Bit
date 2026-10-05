import { useState } from "react";
import type { CrewbitState } from "@crewbit/shared/react";
import { AgentsView } from "../components/AgentsView";
import { ChatView } from "../components/ChatView";
import { CrewsView } from "../components/CrewsView";
import { SettingsView } from "../components/SettingsView";
import { SyncBadge, type Tab } from "./common";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "crews", label: "Crews", icon: "👥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

/** Phone layout: header, one screen at a time, bottom tab bar. */
export function MobileShell({ app }: { app: CrewbitState }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [chatsOpen, setChatsOpen] = useState(false);
  // Hide the tab bar while typing, so the keyboard leaves room for the chat.
  const [typing, setTyping] = useState(false);

  const title = tab === "chat" ? app.active?.title ?? "New chat" : TABS.find((t) => t.id === tab)!.label;

  return (
    <div className="m-app">
      <header className="m-header">
        {tab === "chat" ? (
          <button className="m-icon" aria-label="Your chats" onClick={() => setChatsOpen(true)}>
            ☰
          </button>
        ) : (
          <span className="m-brand">⚡</span>
        )}
        <h1 className="m-title">{title}</h1>
        <SyncBadge app={app} compact />
        {tab === "chat" && (
          <button className="m-icon accent" aria-label="New chat" onClick={() => app.newConversation()}>
            ＋
          </button>
        )}
      </header>

      <main className="m-main">
        {tab === "chat" && (
          <ChatView app={app} variant="mobile" onOpenSettings={() => setTab("settings")} onTypingChange={setTyping} />
        )}
        {tab === "agents" && <AgentsView app={app} />}
        {tab === "crews" && <CrewsView app={app} />}
        {tab === "settings" && <SettingsView app={app} />}
      </main>

      {!typing && (
        <nav className="m-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              <span className="m-tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      {chatsOpen && (
        <div className="m-sheet" role="dialog" aria-label="Your chats">
          <header className="m-header">
            <h1 className="m-title">Chats</h1>
            <button className="m-text-btn" onClick={() => setChatsOpen(false)}>
              Done
            </button>
          </header>
          <button
            className="btn primary m-wide"
            onClick={() => {
              app.newConversation();
              setChatsOpen(false);
            }}
          >
            ＋ New chat
          </button>
          <div className="m-list">
            {app.conversations.length === 0 && <p className="muted m-pad">No chats yet.</p>}
            {app.conversations.map((c) => (
              <div key={c.id} className={`m-list-item ${c.id === app.active?.id ? "active" : ""}`}>
                <button
                  className="m-list-main"
                  onClick={() => {
                    app.selectConversation(c.id);
                    setChatsOpen(false);
                  }}
                >
                  <span className="m-list-title">{c.title}</span>
                  <span className="muted small">
                    {new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                    {c.messages.length} messages
                  </span>
                </button>
                <button
                  className="m-icon"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => confirm(`Delete "${c.title}"?`) && app.deleteConversation(c.id)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
