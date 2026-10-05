import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { fetch as expoFetch } from "expo/fetch";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { FetchLike } from "@crewbit/shared";
import { useCrewbit, type KeyValueStorage } from "@crewbit/shared/react";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { CrewsScreen } from "./src/screens/CrewsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { useTheme } from "./src/ui";

type Tab = "chat" | "agents" | "crews" | "settings";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "agents", label: "Agents", icon: "🤖" },
  { id: "crews", label: "Crews", icon: "👥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const storage: KeyValueStorage = AsyncStorage;
// expo/fetch supports streaming response bodies, which the chat stream needs.
const streamingFetch = expoFetch as unknown as FetchLike;
const defaultConnection = {
  serverUrl: process.env.EXPO_PUBLIC_CREWBIT_SERVER_URL ?? "http://localhost:8787",
  token: "",
};

function Main() {
  const app = useCrewbit({ storage, fetch: streamingFetch, defaultConnection });
  const [tab, setTab] = useState<Tab>("chat");
  const t = useTheme();

  if (!app.loaded) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "left", "right"]}>
      <StatusBar style="auto" />
      <View style={{ flex: 1 }}>
        {tab === "chat" && <ChatScreen app={app} />}
        {tab === "agents" && <AgentsScreen app={app} />}
        {tab === "crews" && <CrewsScreen app={app} />}
        {tab === "settings" && <SettingsScreen app={app} fetchImpl={streamingFetch} />}
      </View>
      <SafeAreaView
        edges={["bottom"]}
        style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.border, backgroundColor: t.panel }}
      >
        {TABS.map((x) => (
          <Pressable key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontSize: 20, opacity: tab === x.id ? 1 : 0.5 }}>{x.icon}</Text>
            <Text style={{ fontSize: 11, color: tab === x.id ? t.accent : t.muted }}>{x.label}</Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
