import { useState, type ReactNode } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
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
import { Button, Chip, Field, Input, Row, useTheme } from "../ui";

export function SettingsScreen({ app }: { app: CrewbitState }) {
  const t = useTheme();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700" }}>Settings</Text>
      <Providers app={app} />
      <GitHubSync app={app} />
      <RunMode app={app} />
      <Button
        title="Reset agents & crews to defaults"
        kind="danger"
        onPress={() =>
          Alert.alert("Reset agents and crews?", "Your custom agents and crews will be removed.", [
            { text: "Cancel", style: "cancel" },
            { text: "Reset", style: "destructive", onPress: app.resetPresets },
          ])
        }
      />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 14, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.panel }}>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{title}</Text>
      {children}
    </View>
  );
}

function Note({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ color: color ?? t.muted, fontSize: 13 }}>{children}</Text>;
}

// ---------------------------------------------------------------------------

function Providers({ app }: { app: CrewbitState }) {
  const t = useTheme();
  const [editing, setEditing] = useState<Provider | null>(null);
  const [adding, setAdding] = useState(false);

  if (editing) return <ProviderEditor app={app} initial={editing} onDone={() => setEditing(null)} />;

  return (
    <Section title="AI providers">
      <Note>Keys stay on this phone and go only to that provider. They are never synced to GitHub.</Note>
      {app.providers.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => setEditing(p)}
          style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderColor: t.border }}
        >
          <Text style={{ color: t.text, flex: 1 }}>{p.name}</Text>
          <Text style={{ color: p.apiKey ? "#10b981" : t.accent, fontSize: 13 }}>{p.apiKey ? "✓ key set" : "no key"}</Text>
        </Pressable>
      ))}
      {adding ? (
        <Row>
          {PROVIDER_TEMPLATES.map((tpl) => (
            <Chip
              key={tpl.id}
              label={tpl.name}
              onPress={() => {
                const id = app.providers.some((p) => p.id === tpl.id) ? newId(tpl.id) : tpl.id;
                setAdding(false);
                setEditing({ id, name: tpl.name, kind: tpl.kind, baseUrl: tpl.baseUrl, apiKey: "" });
              }}
            />
          ))}
        </Row>
      ) : (
        <Button title="+ Add provider" onPress={() => setAdding(true)} />
      )}
    </Section>
  );
}

function ProviderEditor({ app, initial, onDone }: { app: CrewbitState; initial: Provider; onDone: () => void }) {
  const t = useTheme();
  const [p, setP] = useState(initial);
  const [status, setStatus] = useState("");
  const template = PROVIDER_TEMPLATES.find((x) => x.id === initial.id.split("_")[0]);

  return (
    <Section title={initial.name}>
      {template?.note ? <Note color={t.accent}>{template.note}</Note> : null}
      <Field label="Name">
        <Input value={p.name} onChangeText={(v) => setP({ ...p, name: v })} />
      </Field>
      {p.kind === "openai-compatible" && (
        <Field label="API URL">
          <Input value={p.baseUrl} onChangeText={(v) => setP({ ...p, baseUrl: v })} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </Field>
      )}
      <Field label="API key">
        <Input
          value={p.apiKey}
          onChangeText={(v) => setP({ ...p, apiKey: v })}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Paste your key"
        />
      </Field>
      {template?.keyUrl ? (
        <Text style={{ color: t.accent }} onPress={() => void Linking.openURL(template.keyUrl!)}>
          Get a key →
        </Text>
      ) : null}
      {status ? <Note>{status}</Note> : null}
      <View style={{ gap: 8 }}>
        <Button
          title="Save"
          kind="primary"
          onPress={() => {
            app.saveProvider({ ...p, name: p.name.trim() || "Provider", baseUrl: p.baseUrl.trim(), apiKey: p.apiKey.trim() });
            onDone();
          }}
        />
        {p.kind === "openai-compatible" && (
          <Button
            title="Test"
            onPress={async () => {
              setStatus("Checking…");
              try {
                setStatus(`✓ Connected - ${(await listModels(app.fetch, p)).length} models available.`);
              } catch (err) {
                setStatus(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        )}
        <Button title="Cancel" onPress={onDone} />
        <Button
          title="Remove"
          kind="danger"
          onPress={() =>
            Alert.alert(`Remove ${p.name}?`, "Agents using it will stop working until you pick another provider.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: () => {
                  app.deleteProvider(p.id);
                  onDone();
                },
              },
            ])
          }
        />
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function GitHubSync({ app }: { app: CrewbitState }) {
  const t = useTheme();
  const [gh, setGh] = useState<GitHubSettings>(app.github);
  const [status, setStatus] = useState<{ text: string; color?: string }>({ text: "" });
  const valid = /^[\w.-]+\/[\w.-]+$/.test(gh.repo.trim()) && gh.token.trim() !== "";

  const save = async () => {
    setStatus({ text: "Checking…" });
    try {
      const repo = await new GitHubStore(gh, app.fetch, {}).checkRepo();
      if (!repo.private) {
        setStatus({ text: `${gh.repo} is PUBLIC - anyone could read your chats. Make it private first.`, color: t.danger });
        return;
      }
      app.setGitHub({ ...gh, enabled: true });
      setStatus({ text: `✓ Connected to private repo ${gh.repo}.`, color: "#10b981" });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), color: t.danger });
    }
  };

  return (
    <Section title="GitHub sync">
      <Note>
        Saves agents, crews and chats as JSON in a private GitHub repo so every device shares them. See the
        README for how to create the repo and a fine-grained token (Contents: read and write).
      </Note>
      <Field label="Repository (owner/name)">
        <Input value={gh.repo} onChangeText={(v) => setGh({ ...gh, repo: v.trim() })} autoCapitalize="none" autoCorrect={false} placeholder="you/crewbit-data" />
      </Field>
      <Field label="Access token">
        <Input value={gh.token} onChangeText={(v) => setGh({ ...gh, token: v.trim() })} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="github_pat_…" />
      </Field>
      <Field label="Folder">
        <Input value={gh.folder} onChangeText={(v) => setGh({ ...gh, folder: v.trim() })} autoCapitalize="none" autoCorrect={false} />
      </Field>
      {status.text ? <Note color={status.color}>{status.text}</Note> : null}
      {app.github.enabled && app.sync.state === "error" ? <Note color={t.danger}>{app.sync.message}</Note> : null}
      {app.github.enabled && app.sync.state === "ok" && app.sync.at ? (
        <Note>Last synced {new Date(app.sync.at).toLocaleTimeString()}.</Note>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button title="Save & sync" kind="primary" disabled={!valid} onPress={() => void save()} />
        {app.github.enabled && (
          <>
            <Button title={app.sync.state === "syncing" ? "Syncing…" : "Sync now"} onPress={() => void app.syncNow()} />
            <Button title="Turn off sync" kind="danger" onPress={() => app.setGitHub({ ...app.github, enabled: false })} />
          </>
        )}
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function RunMode({ app }: { app: CrewbitState }) {
  const [server, setServer] = useState(app.server);
  const [status, setStatus] = useState("");

  return (
    <Section title="Where agents run">
      <Row>
        <Chip label="Directly from this phone" selected={app.runMode === "direct"} onPress={() => app.setRunMode("direct")} />
        <Chip label="Through a Crewbit server" selected={app.runMode === "server"} onPress={() => app.setRunMode("server")} />
      </Row>
      {app.runMode === "server" && (
        <>
          <Field label="Server URL">
            <Input value={server.url} onChangeText={(v) => setServer({ ...server, url: v.trim() })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.20:8787" />
          </Field>
          <Field label="Server access token">
            <Input value={server.token} onChangeText={(v) => setServer({ ...server, token: v })} autoCapitalize="none" autoCorrect={false} secureTextEntry />
          </Field>
          <Button
            title="Save & test"
            kind="primary"
            onPress={async () => {
              app.setServer(server);
              setStatus("Checking…");
              try {
                setStatus(`✓ Connected to ${(await fetchServerInfo(app.fetch, server)).name}.`);
              } catch (err) {
                setStatus(`Could not reach server: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
          {status ? <Note>{status}</Note> : null}
        </>
      )}
    </Section>
  );
}
