import type { Accessor } from "solid-js";
import { useTheme } from "../context/theme";
import { Section } from "./Section";

export interface ServerStatusProps {
  url: Accessor<string | null>;
  connected: Accessor<boolean>;
  event: Accessor<string>;
}

export function ServerStatus(props: ServerStatusProps) {
  const { theme } = useTheme();

  return (
    <Section title="Server">
      <box
        flexDirection="row"
        gap={1}
        backgroundColor={theme.backgroundPanel}
        height={1}
      >
        <text fg={props.connected() ? theme.connected : theme.disconnected}>
          •
        </text>
        <text fg={props.connected() ? theme.text : theme.textMuted}>
          {props.url() ?? "disconnected"}
        </text>
      </box>
      <box height={1}>
        <text>{props.event()}</text>
      </box>
    </Section>
  );
}
