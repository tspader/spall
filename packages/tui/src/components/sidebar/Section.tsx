import type { JSXElement } from "solid-js";
import { useTheme } from "../../context/theme";
import { useSidebar, type SidebarSection } from "../../context/sidebar";
import { EmptyBorder } from "../HalfLineShadow";

/** Static section title (for Server, Project, etc.) */
function SectionTitle(props: { title: string }) {
  return (
    <box
      flexShrink={0}
    >
      <text>
        <span style={{ bold: true }}>{props.title}</span>
      </text>
    </box>
  );
}

/** Selectable sidebar section title (for Files, Comments) */
export function Title(props: { section: SidebarSection }) {
  const { theme } = useTheme();
  const sidebar = useSidebar();

  const isActive = () => sidebar.activeSection() === props.section;
  const color = () => (isActive() ? theme.primary : undefined);
  const title = () =>
    props.section.charAt(0).toUpperCase() + props.section.slice(1);

  return (
    <box
      flexShrink={0}
      border={["left"]}
      borderColor={isActive() ? theme.primary : theme.indicatorDefault}
      customBorderChars={{
        ...EmptyBorder,
        vertical: "▌"
      }}

    >
      <text>
        <span style={{ bold: true }}>{title()}</span>
      </text>
    </box>
  );
}

/** Container for static sidebar sections */
export function Section(props: { title: string; children: JSXElement }) {
  const { theme } = useTheme();

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      flexShrink={0}
    >
      <SectionTitle title={props.title} />
      {props.children}
    </box>
  );
}
