import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { CLAUDE_MODELS, blankAgent, listModels, newId, type Agent, type Effort } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";
import { Button, Chip, Field, Input, Row, useTheme } from "../ui";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const COLORS = ["#f97316", "#3b82f6", "#a855f7", "#10b981", "#ec4899", "#eab308", "#ef4444", "#64748b"];

export function AgentsScreen({ app }: { app: CrewbitState }) {
  const t = useTheme();
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700" }}>Agents</Text>
      <Text style={{ color: t.muted }}>
        Personas with their own prompt and model. Pair them up in Crews.
      </Text>
      <Button title="+ New agent" kind="primary" onPress={() => setEditing(blankAgent(newId("agent")))} />
      {app.agents.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => setEditing(a)}
          style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.panel }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: a.color, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{a.name}</Text>
            <Text style={{ color: t.muted }} numberOfLines={2}>
              {a.tagline || a.systemPrompt}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
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
  const t = useTheme();
  const [a, setA] = useState(initial);
  const set = <K extends keyof Agent>(k: K, v: Agent[K]) => setA((x) => ({ ...x, [k]: v }));
  const provider = app.providers.find((p) => p.id === a.provider);
  const claude = provider?.kind === "anthropic";
  const [models, setModels] = useState<string[]>([]);
  const [modelsStatus, setModelsStatus] = useState("");
  const loadModels = async () => {
    if (!provider) return;
    setModelsStatus("Loading…");
    try {
      setModels(await listModels(app.fetch, provider));
      setModelsStatus("");
    } catch (err) {
      setModelsStatus(err instanceof Error ? err.message : String(err));
    }
  };
  const query = a.model.toLowerCase();
  const suggestions = models.filter((m) => m.toLowerCase().includes(query) && m !== a.model).slice(0, 12);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
        {isNew ? "New agent" : `Edit ${initial.name}`}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ width: 80 }}>
          <Field label="Emoji">
            <Input value={a.emoji} onChangeText={(v) => set("emoji", v)} maxLength={4} />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Name">
            <Input value={a.name} onChangeText={(v) => set("name", v)} maxLength={60} />
          </Field>
        </View>
      </View>
      <Field label="Colour">
        <Row>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => set("color", c)}
              style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: a.color === c ? 3 : 0, borderColor: t.text }}
            />
          ))}
        </Row>
      </Field>
      <Field label="Tagline">
        <Input value={a.tagline} onChangeText={(v) => set("tagline", v)} placeholder="One line about this agent" />
      </Field>
      <Field label="System prompt">
        <Input value={a.systemPrompt} onChangeText={(v) => set("systemPrompt", v)} multiline />
      </Field>
      <Field label="Provider">
        <Row>
          {app.providers.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={a.provider === p.id}
              onPress={() => {
                setModels([]);
                setA((x) => ({ ...x, provider: p.id, model: p.kind === "anthropic" ? CLAUDE_MODELS[0].id : "" }));
              }}
            />
          ))}
        </Row>
      </Field>
      {claude ? (
        <>
          <Field label="Model">
            <Row>
              {CLAUDE_MODELS.map((m) => (
                <Chip key={m.id} label={m.label} selected={a.model === m.id} onPress={() => set("model", m.id)} />
              ))}
            </Row>
          </Field>
          {a.model !== "claude-haiku-4-5" && (
            <Field label="Effort (how hard it thinks)">
              <Row>
                {EFFORTS.map((e) => (
                  <Chip key={e} label={e} selected={a.effort === e} onPress={() => set("effort", e)} />
                ))}
              </Row>
            </Field>
          )}
        </>
      ) : (
        <Field label="Model">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input value={a.model} onChangeText={(v) => set("model", v)} autoCapitalize="none" autoCorrect={false} placeholder="Model id" />
            </View>
            <Button title="Load list" onPress={() => void loadModels()} />
          </View>
          {modelsStatus ? <Text style={{ color: t.muted, fontSize: 13 }}>{modelsStatus}</Text> : null}
          {suggestions.length > 0 && (
            <Row>
              {suggestions.map((m) => (
                <Chip key={m} label={m} onPress={() => set("model", m)} />
              ))}
            </Row>
          )}
        </Field>
      )}
      {claude ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <Text style={{ color: t.text, flex: 1 }}>Allow web search</Text>
          <Switch value={a.webSearch} onValueChange={(v) => set("webSearch", v)} />
        </View>
      ) : (
        <Text style={{ color: t.muted, fontSize: 13, marginBottom: 20 }}>
          Web search and thinking effort are available for Claude agents only.
        </Text>
      )}
      <View style={{ gap: 10 }}>
        <Button
          title="Save"
          kind="primary"
          onPress={() => {
            if (!a.model.trim()) return Alert.alert("Pick a model for this agent.");
            onSave({ ...a, name: a.name.trim() || "Agent", model: a.model.trim() });
          }}
        />
        <Button title="Cancel" onPress={onCancel} />
        {!isNew && (
          <Button
            title="Delete"
            kind="danger"
            onPress={() =>
              Alert.alert(`Delete ${a.name}?`, undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: onDelete },
              ])
            }
          />
        )}
      </View>
    </ScrollView>
  );
}
