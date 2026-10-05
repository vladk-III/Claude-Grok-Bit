import type { CrewbitState } from "@crewbit/shared/react";

export type Tab = "chat" | "agents" | "crews" | "settings";

export function SyncBadge({ app, compact }: { app: CrewbitState; compact?: boolean }) {
  if (app.sync.state === "off") return null;
  const label =
    app.sync.state === "syncing" ? "⟳ Syncing…" : app.sync.state === "error" ? "⚠️ Sync failed" : "✓ Synced to GitHub";
  return (
    <button
      className={`sync-status ${app.sync.state} ${compact ? "compact" : ""}`}
      title={app.sync.message ?? "Sync with GitHub now"}
      aria-label={label}
      onClick={() => void app.syncNow()}
    >
      {compact ? label.split(" ")[0] : label}
    </button>
  );
}
