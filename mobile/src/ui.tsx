// Theme and small building blocks for the mobile app.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useColorScheme, type TextInputProps } from "react-native";

const dark = {
  bg: "#0b0d12",
  panel: "#12151c",
  panel2: "#1a1e27",
  border: "#262b36",
  text: "#e6e8ee",
  muted: "#8b93a7",
  accent: "#f97316",
  danger: "#ef4444",
};
const light: typeof dark = {
  bg: "#f7f7f9",
  panel: "#ffffff",
  panel2: "#f0f1f5",
  border: "#e2e4ea",
  text: "#15171c",
  muted: "#5d6475",
  accent: "#f97316",
  danger: "#ef4444",
};
export type Theme = typeof dark;

export function useTheme(): Theme {
  return useColorScheme() === "light" ? light : dark;
}

export function Button({
  title,
  onPress,
  kind = "default",
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = kind === "primary" ? t.accent : kind === "danger" ? "transparent" : t.panel2;
  const border = kind === "primary" ? t.accent : kind === "danger" ? t.danger : t.border;
  const color = kind === "primary" ? "#fff" : kind === "danger" ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={{ color, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  color,
  onPress,
}: {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? t.accent : color ?? t.border,
          backgroundColor: selected ? t.accent : t.panel2,
        },
      ]}
    >
      <Text style={{ color: selected ? "#fff" : t.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: 14 }}>
      <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[
        styles.input,
        { backgroundColor: t.panel2, borderColor: t.border, color: t.text },
        props.multiline && { minHeight: 140, textAlignVertical: "top" },
        props.style,
      ]}
    />
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  chip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
