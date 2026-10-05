// A small markdown renderer covering what chat replies use: headings, lists,
// quotes, fenced code, bold, italics, inline code and links.
import type { ReactNode } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import type { Theme } from "./ui";

export function Markdown({ text, t }: { text: string; t: Theme }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  const base = { color: t.text, fontSize: 16, lineHeight: 23 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const key = `b${i}`;

    if (line.startsWith("```")) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      blocks.push(
        <ScrollView key={key} horizontal style={{ backgroundColor: t.panel2, borderRadius: 8 }}>
          <Text selectable style={{ color: t.text, fontFamily: "monospace", fontSize: 13, padding: 10 }}>
            {code.join("\n")}
          </Text>
        </ScrollView>,
      );
      continue;
    }
    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      const size = [22, 20, 18, 17, 16, 16][heading[1].length - 1];
      blocks.push(
        <Text key={key} selectable style={{ ...base, fontSize: size, fontWeight: "700" }}>
          {inline(heading[2], t)}
        </Text>,
      );
      continue;
    }
    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (item) {
      const bullet = /\d/.test(item[2]) ? item[2] : "•";
      blocks.push(
        <View key={key} style={{ flexDirection: "row", paddingLeft: Math.min(item[1].length, 6) * 6 }}>
          <Text style={{ ...base, width: 22 }}>{bullet}</Text>
          <Text selectable style={{ ...base, flex: 1 }}>
            {inline(item[3], t)}
          </Text>
        </View>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      blocks.push(
        <Text key={key} selectable style={{ ...base, color: t.muted, borderLeftWidth: 3, borderColor: t.border, paddingLeft: 10 }}>
          {inline(line.replace(/^>\s?/, ""), t)}
        </Text>,
      );
      continue;
    }
    blocks.push(
      <Text key={key} selectable style={base}>
        {inline(line, t)}
      </Text>,
    );
  }
  return <View style={{ gap: 6 }}>{blocks}</View>;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string, t: Theme): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <Text key={i} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <Text key={i} style={{ fontFamily: "monospace", backgroundColor: t.panel2, fontSize: 14 }}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^https?:\/\//i.test(link[2])) {
      return (
        <Text key={i} style={{ color: t.accent }} onPress={() => void Linking.openURL(link[2])}>
          {link[1]}
        </Text>
      );
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      if (part.length > 2) return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>;
    }
    return part;
  });
}
