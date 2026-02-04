import type { Accessor } from "solid-js";
import { Show } from "solid-js";
import { useTheme } from "../../context/theme";
import { Section } from "./Section";
import { basename, dirname } from "path";

export interface ProjectStatusProps {
  repoRoot: Accessor<string | null>;
  commentCount: Accessor<number>;
}

export function ProjectStatus(props: ProjectStatusProps) {
  const { theme } = useTheme();

  const displayName = () => {
    const root = props.repoRoot();
    return root ? basename(root) : null;
  };

  return (
    <Section title="Review">
      <Show when={displayName()}>
        <box flexDirection="row" flexShrink={0}>
          <text fg={theme.text}>{displayName()}</text>
          <text fg={theme.textMuted}> ({props.commentCount()} comments)</text>
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
