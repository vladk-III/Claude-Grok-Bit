import { useState } from "react";
import { fetchServerInfo, type FetchLike } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";

export function SettingsView({ app }: { app: CrewbitState }) {
  const [conn, setConn] = useState(app.connection);
  const [status, setStatus] = useState("");

  const test = async () => {
    setStatus("Checking…");
    try {
      const info = await fetchServerInfo(fetch as unknown as FetchLike, conn);
      setStatus(`Connected to ${info.name}.${info.requiresToken ? " Server requires an access token." : ""}`);
    } catch (err) {
      setStatus(`Could not reach server: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <form
      className="page form"
      onSubmit={(e) => {
        e.preventDefault();
        app.setConnection(conn);
        setStatus("Saved.");
      }}
    >
      <label className="field">
        Server URL
        <input
          value={conn.serverUrl}
          placeholder="Leave empty to use this site's server"
          onChange={(e) => setConn({ ...conn, serverUrl: e.target.value })}
        />
      </label>
      <label className="field">
        Access token
        <input
          type="password"
          value={conn.token}
          placeholder="Only if the server sets CREWBIT_ACCESS_TOKEN"
          onChange={(e) => setConn({ ...conn, token: e.target.value })}
        />
      </label>
      <div className="actions">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn" onClick={() => void test()}>
          Test connection
        </button>
      </div>
      {status && <p className="muted">{status}</p>}

      <hr />
      <p className="muted small">
        Agents, crews and chats are stored in this browser only. Your Anthropic API key stays on the
        server and is never sent to the browser.
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn danger"
          onClick={() => confirm("Restore the built-in agents and crews? Your custom ones will be removed.") && app.resetPresets()}
        >
          Reset agents & crews to defaults
        </button>
      </div>
    </form>
  );
}
