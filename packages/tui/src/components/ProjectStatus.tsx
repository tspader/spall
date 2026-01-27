import type { Accessor } from "solid-js";
import { Show } from "solid-js";
import { useTheme } from "../context/theme";
import { Section } from "./Section";
import { basename, dirname } from "path";

export interface ProjectStatusProps {
  repoRoot: Accessor<string | null>;
  projectName: Accessor<string | null>;
  noteCount: Accessor<number>;
}

export function ProjectStatus(props: ProjectStatusProps) {
  const { theme } = useTheme();

  return (
    <Section title="Project">
      <Show when={props.projectName()}>
        <box flexDirection="row" flexShrink={0}>
          <text fg={theme.text}>{props.projectName()}</text>
          <text fg={theme.textMuted}> ({props.noteCount()} notes)</text>
        </box>
      </Show>
      <Show when={props.repoRoot()}>
        <box flexDirection="row" flexShrink={0}>
          <text fg={theme.textMuted}>{dirname(props.repoRoot()!)}/</text>
          <text fg={theme.text}>{basename(props.repoRoot()!)}</text>
        </box>
      </Show>
    </Section>
  );
}
