import { useTheme } from "../../context/theme";
import { useServer } from "../../context/server";
import { Section } from "./Section";

export function ServerStatus() {
  const { theme } = useTheme();
  const server = useServer();

  return (
    <Section title="Server">
      <box
        flexDirection="row"
        gap={1}
        backgroundColor={theme.backgroundPanel}
        height={1}
      >
        <text fg={server.connected() ? theme.connected : theme.disconnected}>
          •
        </text>
        <text fg={server.connected() ? theme.text : theme.textMuted}>
          {server.url() ?? "disconnected"}
        </text>
      </box>
      <box height={1}>
        <text>{server.event()}</text>
      </box>
    </Section>
  );
}
