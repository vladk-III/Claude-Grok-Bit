import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Agent, ChatMessage } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";
import { Markdown } from "../Markdown";
import { Button, Chip, useTheme, type Theme } from "../ui";

export function ChatScreen({ app, onOpenSettings }: { app: CrewbitState; onOpenSettings: () => void }) {
  const t = useTheme();
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messages = app.active?.messages ?? [];
  const agentsById = new Map(app.agents.map((a) => [a.id, a]));
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const crew = app.activeCrew;
  const crewAgentIds = new Set([...(crew?.agentIds ?? []), ...(crew?.synthesizerId ? [crew.synthesizerId] : [])]);
  const missingKeys =
    app.runMode === "direct"
      ? app.providers.filter(
          (p) => !p.apiKey && !p.baseUrl.includes("localhost") && app.agents.some((a) => crewAgentIds.has(a.id) && a.provider === p.id),
        )
      : [];

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
        <Pressable onPress={() => setHistoryOpen(true)} hitSlop={10}>
          <Text style={{ color: t.text, fontSize: 22 }}>☰</Text>
        </Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontWeight: "700", fontSize: 17 }}>
          {app.active?.title ?? "⚡ Crewbit"}
        </Text>
        <Pressable onPress={() => app.newConversation()} hitSlop={10}>
          <Text style={{ color: t.accent, fontSize: 15, fontWeight: "600" }}>+ New</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, borderBottomWidth: 1, borderColor: t.border }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 10 }}
      >
        {app.crews.map((c) => (
          <Chip key={c.id} label={c.name} selected={c.id === app.activeCrew?.id} onPress={() => pickCrew(c.id)} />
        ))}
      </ScrollView>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, gap: 16, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ fontSize: 40 }}>⚡</Text>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "700", marginVertical: 6 }}>
              What's on your mind?
            </Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>
              Pick a crew above to have several agents research, debate and sum up together.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Bubble
            t={t}
            message={item}
            agent={item.agentId ? agentsById.get(item.agentId) : undefined}
            streaming={app.running && index > lastUserIndex}
          />
        )}
      />

      {missingKeys.length > 0 && (
        <Pressable onPress={onOpenSettings} style={{ marginHorizontal: 12, padding: 10, borderRadius: 8, backgroundColor: "#f9731620" }}>
          <Text style={{ color: t.accent }}>
            Add your API key for {missingKeys.map((p) => p.name).join(", ")} in Settings to start chatting.
          </Text>
        </Pressable>
      )}
      {app.sync.state === "error" && (
        <Pressable onPress={() => void app.syncNow()} style={{ marginHorizontal: 12, padding: 8 }}>
          <Text style={{ color: t.danger, fontSize: 12 }}>⚠️ GitHub sync failed: {app.sync.message} (tap to retry)</Text>
        </Pressable>
      )}
      {app.error && (
        <Pressable onPress={app.clearError} style={{ marginHorizontal: 12, padding: 10, borderRadius: 8, backgroundColor: "#ef444420" }}>
          <Text style={{ color: t.danger }}>{app.error}</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: "row", gap: 8, padding: 10, alignItems: "flex-end" }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={`Message ${app.activeCrew?.name ?? "Crewbit"}…`}
          placeholderTextColor={t.muted}
          multiline
          style={{
            flex: 1,
            maxHeight: 140,
            minHeight: 44,
            color: t.text,
            backgroundColor: t.panel,
            borderColor: t.border,
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingTop: 11,
            paddingBottom: 11,
            fontSize: 16,
          }}
        />
        {app.running ? (
          <Button title="Stop" kind="danger" onPress={app.stop} />
        ) : (
          <Button title="Send" kind="primary" onPress={submit} disabled={!draft.trim()} />
        )}
      </View>

      <Modal visible={historyOpen} animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>Chats</Text>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={10}>
              <Text style={{ color: t.accent, fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={app.conversations}
            keyExtractor={(c) => c.id}
            ListEmptyComponent={<Text style={{ color: t.muted, padding: 16 }}>No chats yet.</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  app.selectConversation(item.id);
                  setHistoryOpen(false);
                }}
                onLongPress={() => app.deleteConversation(item.id)}
                style={{
                  padding: 16,
                  borderBottomWidth: 1,
                  borderColor: t.border,
                  backgroundColor: item.id === app.active?.id ? t.panel2 : undefined,
                }}
              >
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 16 }}>
                  {item.title}
                </Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  {new Date(item.updatedAt).toLocaleString()} · long-press to delete
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Bubble({
  t,
  message,
  agent,
  streaming,
}: {
  t: Theme;
  message: ChatMessage;
  agent?: Agent;
  streaming: boolean;
}) {
  const [showThinking, setShowThinking] = useState(false);

  if (message.role === "user") {
    return (
      <View style={{ alignItems: "flex-end" }}>
        <View style={{ backgroundColor: t.accent, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, maxWidth: "85%" }}>
          <Text selectable style={{ color: "#fff", fontSize: 16 }}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  const color = agent?.color ?? "#64748b";
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 16 }}>{agent?.emoji ?? "🤖"}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color, fontWeight: "700" }}>
          {message.agentName ?? agent?.name ?? "Agent"}
          {message.model ? <Text style={{ color: t.muted, fontWeight: "400", fontSize: 11 }}>  {message.model}</Text> : null}
        </Text>
        {message.searches?.map((q, i) => (
          <Text key={i} style={{ color: t.muted, fontSize: 12 }}>
            🔎 {q}
          </Text>
        ))}
        {message.thinking ? (
          <Pressable onPress={() => setShowThinking((s) => !s)}>
            <Text style={{ color: t.muted, fontSize: 13 }}>
              {showThinking ? "▾" : "▸"} Thinking
            </Text>
            {showThinking && (
              <Text style={{ color: t.muted, fontSize: 13, borderLeftWidth: 2, borderColor: t.border, paddingLeft: 8 }}>
                {message.thinking}
              </Text>
            )}
          </Pressable>
        ) : null}
        {message.text ? (
          <Pressable onLongPress={() => void Clipboard.setStringAsync(message.text)}>
            <Markdown text={message.text} t={t} />
          </Pressable>
        ) : streaming && !message.error ? (
          <Text style={{ color: t.muted }}>thinking…</Text>
        ) : null}
        {message.error ? <Text style={{ color: t.danger }}>⚠️ {message.error}</Text> : null}
      </View>
    </View>
  );
}
