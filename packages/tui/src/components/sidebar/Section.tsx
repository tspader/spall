import type { JSXElement } from "solid-js";
import { splitProps } from "solid-js";
import { useTheme } from "../../context/theme";

export interface TitleProps {
  title: string;
}

export function Title(props: TitleProps) {
  return (
    <box flexShrink={0}>
      <text>
        <span style={{ bold: true }}>{props.title}</span>
      </text>
    </box>
  );
}

export function Section(props: {
  title: string;
  flexGrow?: number;
  children: JSXElement;
}) {
  const { theme } = useTheme();

  const [_, boxProps] = splitProps(props, ["title", "children"]);
  return (
    <box
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      flexShrink={0}
      {...boxProps}
    >
      <Title title={props.title} />
      {props.children}
    </box>
  );
}
