import { useEffect, useState } from "react";
import type { FetchLike } from "@crewbit/shared";
import { useCrewbit, type KeyValueStorage } from "@crewbit/shared/react";
import { AgentsView } from "./components/AgentsView";
import { ChatView } from "./components/ChatView";
import { CrewsView } from "./components/CrewsView";
import { SettingsView } from "./components/SettingsView";

type Tab = "chat" | "agents" | "crews" | "settings";

const storage: KeyValueStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode or quota exceeded */
    }
  },
};
const browserFetch = ((url, init) => fetch(url, init)) as FetchLike;

export default function App() {
  const app = useCrewbit({ storage, fetch: browserFetch, defaultRunMode: "direct" });
  const [tab, setTab] = useState<Tab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { syncNow, github } = app;

  // Pick up changes made on other devices when coming back to this tab.
  useEffect(() => {
    if (!github.enabled) return;
    const onVisible = () => document.visibilityState === "visible" && void syncNow();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [github.enabled, syncNow]);

  if (!app.loaded) return null;

  const go = (t: Tab) => {
    setTab(t);
    setDrawerOpen(false);
  };

  return (
    <div className="layout">
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">⚡</span> Crewbit
        </div>
        <button
          className="btn primary wide"
          onClick={() => {
            app.newConversation();
            go("chat");
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
                go("chat");
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
        {app.sync.state !== "off" && (
          <button
            className={`sync-status ${app.sync.state}`}
            title={app.sync.message ?? "Sync with GitHub now"}
            onClick={() => void app.syncNow()}
          >
            {app.sync.state === "syncing" ? "⟳ Syncing…" : app.sync.state === "error" ? "⚠️ Sync failed" : "✓ Synced to GitHub"}
          </button>
        )}
        <div className="side-nav">
          <button className={tab === "agents" ? "active" : ""} onClick={() => go("agents")}>
            🤖 Agents
          </button>
          <button className={tab === "crews" ? "active" : ""} onClick={() => go("crews")}>
            👥 Crews
          </button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => go("settings")}>
            ⚙️ Settings
          </button>
        </div>
      </aside>
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setDrawerOpen(true)} aria-label="Menu">
            ☰
          </button>
          <span className="topbar-title">
            {tab === "chat" ? app.active?.title ?? "New chat" : tab[0].toUpperCase() + tab.slice(1)}
          </span>
        </header>
        {tab === "chat" && <ChatView app={app} onOpenSettings={() => go("settings")} />}
        {tab === "agents" && <AgentsView app={app} />}
        {tab === "crews" && <CrewsView app={app} />}
        {tab === "settings" && <SettingsView app={app} />}
      </main>
    </div>
  );
}
