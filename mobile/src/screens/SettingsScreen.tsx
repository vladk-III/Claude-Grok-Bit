import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { fetchServerInfo, type FetchLike } from "@crewbit/shared";
import type { CrewbitState } from "@crewbit/shared/react";
import { Button, Field, Input, useTheme } from "../ui";

export function SettingsScreen({ app, fetchImpl }: { app: CrewbitState; fetchImpl: FetchLike }) {
  const t = useTheme();
  const [conn, setConn] = useState(app.connection);
  const [status, setStatus] = useState("");

  const test = async () => {
    setStatus("Checking…");
    try {
      const info = await fetchServerInfo(fetchImpl, conn);
      setStatus(`Connected to ${info.name}.${info.requiresToken ? " This server needs an access token." : ""}`);
    } catch (err) {
      setStatus(`Could not reach server: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "700", marginBottom: 16 }}>Settings</Text>
      <Field label="Server URL">
        <Input
          value={conn.serverUrl}
          onChangeText={(v) => setConn({ ...conn, serverUrl: v })}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.20:8787"
        />
      </Field>
      <Field label="Access token">
        <Input
          value={conn.token}
          onChangeText={(v) => setConn({ ...conn, token: v })}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Only if the server sets CREWBIT_ACCESS_TOKEN"
        />
      </Field>
      <View style={{ gap: 10 }}>
        <Button
          title="Save"
          kind="primary"
          onPress={() => {
            app.setConnection({ ...conn, serverUrl: conn.serverUrl.trim() });
            setStatus("Saved.");
          }}
        />
        <Button title="Test connection" onPress={() => void test()} />
      </View>
      {status ? <Text style={{ color: t.muted, marginTop: 12 }}>{status}</Text> : null}

      <Text style={{ color: t.muted, fontSize: 13, marginTop: 28, marginBottom: 10 }}>
        Agents, crews and chats are stored on this device. Your Anthropic API key stays on the server.
      </Text>
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
