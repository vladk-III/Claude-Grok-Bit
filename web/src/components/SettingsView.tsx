import { useRef, useState } from "react";
import {
  GitHubStore,
  PROVIDER_TEMPLATES,
  fetchServerInfo,
  listModels,
  newId,
  type GitHubSettings,
  type Provider,
} from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";

export function SettingsView({ app }: { app: CrewbitState }) {
  return (
    <div className="page form">
      <ProvidersSection app={app} />
      <GitHubSection app={app} />
      <RunModeSection app={app} />
      <BackupSection app={app} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProvidersSection({ app }: { app: CrewbitState }) {
  const [editing, setEditing] = useState<Provider | null>(null);
  const [template, setTemplate] = useState("");

  const add = () => {
    const t = PROVIDER_TEMPLATES.find((x) => x.id === template);
    if (!t) return;
    const id = app.providers.some((p) => p.id === t.id) ? newId(t.id) : t.id;
    setEditing({ id, name: t.name, kind: t.kind, baseUrl: t.baseUrl, apiKey: "" });
    setTemplate("");
  };

  return (
    <section className="section">
      <h3>AI providers</h3>
      <p className="muted small">
        Add the services you have API keys for, then pick a provider and model for each agent. Keys
        are stored only in this browser and sent only to that provider. They are never synced to GitHub.
      </p>
      {app.providers.map((p) =>
        editing?.id === p.id ? null : (
          <div key={p.id} className="provider-row">
            <div>
              <strong>{p.name}</strong>
              <div className="muted small">{p.kind === "anthropic" ? "Claude API" : p.baseUrl}</div>
            </div>
            <span className="inline">
              {p.apiKey ? <span className="key-ok">✓ key set</span> : <span className="key-missing">no key</span>}
              <button className="btn" onClick={() => setEditing(p)}>
                Edit
              </button>
            </span>
          </div>
        ),
      )}
      {editing && <ProviderEditor app={app} initial={editing} onDone={() => setEditing(null)} />}
      {!editing && (
        <div className="inline">
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Add a provider…</option>
            {PROVIDER_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!template} onClick={add}>
            Add
          </button>
        </div>
      )}
    </section>
  );
}

function ProviderEditor({ app, initial, onDone }: { app: CrewbitState; initial: Provider; onDone: () => void }) {
  const [p, setP] = useState(initial);
  const [status, setStatus] = useState("");
  const template = PROVIDER_TEMPLATES.find((t) => t.id === initial.id.split("_")[0]);
  const inUse = app.agents.filter((a) => a.provider === p.id);

  const test = async () => {
    setStatus("Checking…");
    try {
      if (p.kind === "anthropic") {
        setStatus("Saved. Send a chat message to confirm the key works.");
        return;
      }
      const models = await listModels(app.fetch, p);
      setStatus(`✓ Connected - ${models.length} models available.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        app.saveProvider({ ...p, name: p.name.trim() || "Provider", baseUrl: p.baseUrl.trim(), apiKey: p.apiKey.trim() });
        onDone();
      }}
    >
      {template?.note && <p className="note warn">{template.note}</p>}
      <label className="field">
        Name
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      {p.kind === "openai-compatible" && (
        <label className="field">
          API URL
          <input
            value={p.baseUrl}
            placeholder="https://…/v1"
            onChange={(e) => setP({ ...p, baseUrl: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        API key{" "}
        {template?.keyUrl && (
          <a href={template.keyUrl} target="_blank" rel="noreferrer" className="small">
            (get a key)
          </a>
        )}
        <input
          type="password"
          autoComplete="off"
          value={p.apiKey}
          placeholder={p.baseUrl.includes("localhost") ? "Not needed for Ollama" : "Paste your key"}
          onChange={(e) => setP({ ...p, apiKey: e.target.value })}
        />
      </label>
      {status && <p className="note">{status}</p>}
      <div className="actions">
        <button type="submit" className="btn primary">
          Save
        </button>
        <button type="button" className="btn" onClick={() => void test()}>
          Test
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className="btn danger push"
          onClick={() => {
            const warning = inUse.length ? ` ${inUse.map((a) => a.name).join(", ")} use it and will stop working.` : "";
            if (confirm(`Remove ${p.name}?${warning}`)) {
              app.deleteProvider(p.id);
              onDone();
            }
          }}
        >
          Remove
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function GitHubSection({ app }: { app: CrewbitState }) {
  const [gh, setGh] = useState<GitHubSettings>(app.github);
  const [status, setStatus] = useState<{ kind: "" | "ok" | "warn" | "danger"; text: string }>({ kind: "", text: "" });

  const check = async (): Promise<boolean> => {
    setStatus({ kind: "", text: "Checking…" });
    try {
      const repo = await new GitHubStore(gh, app.fetch, {}).checkRepo();
      if (!repo.private) {
        setStatus({
          kind: "danger",
          text: `${gh.repo} is PUBLIC - anyone could read your chats. Make it private (repo Settings → General → Danger Zone) or pick another repo.`,
        });
        return false;
      }
      setStatus({ kind: "ok", text: `✓ Connected to private repo ${gh.repo}.` });
      return true;
    } catch (err) {
      setStatus({ kind: "danger", text: err instanceof Error ? err.message : String(err) });
      return false;
    }
  };

  const valid = /^[\w.-]+\/[\w.-]+$/.test(gh.repo.trim()) && gh.token.trim() !== "";

  return (
    <section className="section">
      <h3>GitHub sync</h3>
      <p className="muted small">
        Save your agents, crews and chat history as JSON files in a <strong>private</strong> GitHub
        repository, and pick them up on any device. API keys are never uploaded.
      </p>
      <details className="small">
        <summary>How to set this up</summary>
        <ol>
          <li>
            Create a new <strong>private</strong> repository, for example <code>crewbit-data</code>, at{" "}
            <a href="https://github.com/new" target="_blank" rel="noreferrer">github.com/new</a>. Tick
            "Add a README file".
          </li>
          <li>
            Create a token at{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              github.com/settings/personal-access-tokens/new
            </a>
            : under Repository access choose "Only select repositories" and pick that repo, then under
            Permissions → Repository permissions set <strong>Contents</strong> to "Read and write".
          </li>
          <li>Paste the repo name and token below, then press Save &amp; sync.</li>
        </ol>
      </details>
      <label className="field">
        Repository (owner/name)
        <input
          value={gh.repo}
          placeholder="your-username/crewbit-data"
          onChange={(e) => setGh({ ...gh, repo: e.target.value.trim() })}
        />
      </label>
      <label className="field">
        Access token
        <input
          type="password"
          autoComplete="off"
          value={gh.token}
          placeholder="github_pat_…"
          onChange={(e) => setGh({ ...gh, token: e.target.value.trim() })}
        />
      </label>
      <label className="field">
        Folder in the repository
        <input value={gh.folder} onChange={(e) => setGh({ ...gh, folder: e.target.value.trim() })} />
      </label>
      {status.text && <p className={`note ${status.kind}`}>{status.text}</p>}
      {app.github.enabled && app.sync.state === "error" && <p className="note danger">{app.sync.message}</p>}
      {app.github.enabled && app.sync.state === "ok" && app.sync.at && (
        <p className="muted small">Last synced {new Date(app.sync.at).toLocaleTimeString()}.</p>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={!valid}
          onClick={async () => {
            if (await check()) app.setGitHub({ ...gh, enabled: true });
          }}
        >
          Save &amp; sync
        </button>
        {app.github.enabled && (
          <>
            <button className="btn" onClick={() => void app.syncNow()}>
              Sync now
            </button>
            <button
              className="btn danger push"
              onClick={() => {
                app.setGitHub({ ...app.github, enabled: false });
                setStatus({ kind: "", text: "Sync turned off. Your data stays in GitHub and in this browser." });
              }}
            >
              Turn off sync
            </button>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RunModeSection({ app }: { app: CrewbitState }) {
  const [server, setServer] = useState(app.server);
  const [status, setStatus] = useState("");

  return (
    <section className="section">
      <h3>Where agents run</h3>
      <label className="check">
        <input type="radio" checked={app.runMode === "direct"} onChange={() => app.setRunMode("direct")} />
        <span>
          <strong>Directly from this device</strong>{" "}
          <span className="muted small">(default) - uses the API keys above. No server needed.</span>
        </span>
      </label>
      <label className="check">
        <input type="radio" checked={app.runMode === "server"} onChange={() => app.setRunMode("server")} />
        <span>
          <strong>Through a Crewbit server</strong>{" "}
          <span className="muted small">
            - for when you run the optional server, e.g. to keep keys off this device or reach a provider
            that blocks browsers.
          </span>
        </span>
      </label>
      {app.runMode === "server" && (
        <>
          <label className="field">
            Server URL
            <input
              value={server.url}
              placeholder="http://localhost:8787"
              onChange={(e) => setServer({ ...server, url: e.target.value })}
            />
          </label>
          <label className="field">
            Server access token
            <input
              type="password"
              value={server.token}
              placeholder="Only if the server sets CREWBIT_ACCESS_TOKEN"
              onChange={(e) => setServer({ ...server, token: e.target.value })}
            />
          </label>
          <div className="actions">
            <button
              className="btn primary"
              onClick={async () => {
                app.setServer(server);
                setStatus("Checking…");
                try {
                  const info = await fetchServerInfo(app.fetch, server);
                  setStatus(`✓ Connected to ${info.name}.`);
                } catch (err) {
                  setStatus(`Could not reach server: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            >
              Save &amp; test
            </button>
          </div>
          {status && <p className="note">{status}</p>}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function BackupSection({ app }: { app: CrewbitState }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  return (
    <section className="section">
      <h3>Backup</h3>
      <p className="muted small">Download everything (without API keys) as one JSON file, or load one.</p>
      <div className="actions">
        <button
          className="btn"
          onClick={() => {
            const blob = new Blob([JSON.stringify(app.exportData(), null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `crewbit-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Download backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const data = JSON.parse(await file.text());
              if (data?.app !== "crewbit") throw new Error("That isn't a Crewbit backup file.");
              app.importData(data);
              setStatus("✓ Imported.");
            } catch (err) {
              setStatus(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        <button
          className="btn danger push"
          onClick={() =>
            confirm("Restore the built-in agents and crews? Your custom ones will be removed.") && app.resetPresets()
          }
        >
          Reset agents &amp; crews
        </button>
      </div>
      {status && <p className="note">{status}</p>}
    </section>
  );
}
