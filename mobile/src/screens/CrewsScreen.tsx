import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { newId, type Crew, type CrewMode } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";
import { Button, Chip, Field, Input, Row, useTheme } from "../ui";

const MODES: { id: CrewMode; label: string; help: string }[] = [
  { id: "relay", label: "Relay", help: "One after another; each sees what came before." },
  { id: "parallel", label: "Parallel", help: "Everyone answers independently at once." },
  { id: "roundtable", label: "Roundtable", help: "Discuss in turn for several rounds." },
];

export function CrewsScreen({ app }: { app: CrewbitState }) {
  const t = useTheme();
  const [editing, setEditing] = useState<Crew | null>(null);
  const agentsById = new Map(app.agents.map((a) => [a.id, a]));

  if (editing) {
    return (
      <CrewEditor app={app} initial={editing} isNew={!app.crews.some((c) => c.id === editing.id)} onDone={() => setEditing(null)} />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700" }}>Crews</Text>
      <Text style={{ color: t.muted }}>Pair agents together to research, debate and fact-check.</Text>
      <Button
        title="+ New crew"
        kind="primary"
        onPress={() => setEditing({ id: newId("crew"), name: "New crew", agentIds: [], mode: "relay", rounds: 2 })}
      />
      {app.crews.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => setEditing(c)}
          style={{ padding: 14, gap: 6, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.panel }}
        >
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{c.name}</Text>
          <Text style={{ color: t.muted }}>
            {c.agentIds.map((id) => agentsById.get(id)).filter(Boolean).map((a) => `${a!.emoji} ${a!.name}`).join("  ·  ")}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>
            {MODES.find((m) => m.id === c.mode)?.label}
            {c.mode === "roundtable" ? ` × ${c.rounds}` : ""}
            {c.synthesizerId && agentsById.get(c.synthesizerId) ? ` → ${agentsById.get(c.synthesizerId)!.name} sums up` : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
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
  const t = useTheme();
  const [c, setC] = useState(initial);
  const toggle = (id: string) =>
    setC((x) => ({
      ...x,
      agentIds: x.agentIds.includes(id) ? x.agentIds.filter((a) => a !== id) : [...x.agentIds, id],
    }));

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
        {isNew ? "New crew" : `Edit ${initial.name}`}
      </Text>
      <Field label="Name">
        <Input value={c.name} onChangeText={(v) => setC({ ...c, name: v })} />
      </Field>
      <Field label="Members - tap in speaking order">
        <Row>
          {app.agents.map((a) => {
            const pos = c.agentIds.indexOf(a.id);
            return (
              <Chip
                key={a.id}
                label={`${pos >= 0 ? `${pos + 1}. ` : ""}${a.emoji} ${a.name}`}
                selected={pos >= 0}
                onPress={() => toggle(a.id)}
              />
            );
          })}
        </Row>
      </Field>
      <Field label="How they take turns">
        <View style={{ gap: 8 }}>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setC({ ...c, mode: m.id })}
              style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.mode === m.id ? t.accent : t.border }}
            >
              <Text style={{ color: t.text, fontWeight: "600" }}>{m.label}</Text>
              <Text style={{ color: t.muted, fontSize: 13 }}>{m.help}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      {c.mode === "roundtable" && (
        <Field label="Rounds">
          <Row>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip key={n} label={String(n)} selected={c.rounds === n} onPress={() => setC({ ...c, rounds: n })} />
            ))}
          </Row>
        </Field>
      )}
      <Field label="Final answer by (optional)">
        <Row>
          <Chip label="Nobody" selected={!c.synthesizerId} onPress={() => setC({ ...c, synthesizerId: undefined })} />
          {app.agents.map((a) => (
            <Chip
              key={a.id}
              label={`${a.emoji} ${a.name}`}
              selected={c.synthesizerId === a.id}
              onPress={() => setC({ ...c, synthesizerId: a.id })}
            />
          ))}
        </Row>
      </Field>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button
          title="Save"
          kind="primary"
          onPress={() => {
            if (c.agentIds.length === 0) return Alert.alert("Pick at least one agent.");
            app.saveCrew({ ...c, name: c.name.trim() || "Crew" });
            onDone();
          }}
        />
        <Button title="Cancel" onPress={onDone} />
        {!isNew && (
          <Button
            title="Delete"
            kind="danger"
            onPress={() =>
              Alert.alert(`Delete ${c.name}?`, undefined, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    app.deleteCrew(c.id);
                    onDone();
                  },
                },
              ])
            }
          />
        )}
      </View>
    </ScrollView>
  );
}
