import type { JSXElement } from "solid-js";
import { useTheme } from "../context/theme";

export interface TitleProps {
  title: string;
}

export function Title(props: TitleProps) {
  return (
    <box>
      <text>
        <span style={{ bold: true }}>{props.title}</span>
      </text>
    </box>
  )
}

export function Section(props: { title: string, children: JSXElement }) {
  const { theme } = useTheme();

  return (
    <box flexDirection="column" backgroundColor={theme.backgroundPanel} flexGrow={1}>
      <Title title={props.title} />
      {props.children}
    </box>
  )
}
