import type { Accessor, JSX, JSXElement, splitProps } from "solid-js";
import { useTheme } from "../context/theme";
import { Section } from "./Section";

export interface ServerStatusProps {
  url: Accessor<string | null>;
  connected: Accessor<boolean>;
}

export function ServerStatus(props: ServerStatusProps) {
  const { theme } = useTheme();

  return (
    <Section title="Server">
      <box flexDirection="row" gap={1} backgroundColor={theme.backgroundPanel}>
        <text fg={props.connected() ? theme.connected : theme.disconnected}>
          •
        </text>
        <text fg={props.connected() ? theme.text : theme.textMuted}>
          {props.url() ?? "disconnected"}
        </text>
      </box>
    </Section>
  );
}
