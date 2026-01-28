import { For, Show, createEffect } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../../context/theme";
import { Title } from "./Section";
import type { CommentWithNote } from "../../context/review";

export interface CommentListProps {
  comments: Accessor<CommentWithNote[]>;
  loading: Accessor<boolean>;
  selectedIndex: Accessor<number>;
  focused: Accessor<boolean>;
}

/** Number of items to keep visible below the cursor */
const SCROLL_BUFFER = 2;

// Get short filename from path
function getShortFile(file: string): string {
  const segments = file.split("/");
  return segments[segments.length - 1] || file;
}

export function CommentList(props: CommentListProps) {
  const { theme } = useTheme();
  let scrollbox: ScrollBoxRenderable | null = null;

  // Scroll to keep selection visible
  createEffect(() => {
    const idx = props.selectedIndex();
    if (idx < 0 || !scrollbox) return;

    const viewportHeight = scrollbox.viewport.height;
    const scrollTop = scrollbox.scrollTop;

    if (idx < scrollTop + SCROLL_BUFFER) {
      scrollbox.scrollTo(Math.max(0, idx - SCROLL_BUFFER));
    } else if (idx + 1 > scrollTop + viewportHeight - SCROLL_BUFFER) {
      scrollbox.scrollTo(idx - viewportHeight + SCROLL_BUFFER + 1);
    }
  });

  const commentCount = () => props.comments().length;

  return (
    <box flexDirection="column">
      <box flexDirection="row" flexShrink={0}>
        <Title section="comments" />
        <text fg={theme.textMuted}> ({commentCount()})</text>
      </box>
      <Show when={props.loading()}>
        <box>
          <text fg={theme.textMuted}>Loading...</text>
        </box>
      </Show>

      <Show when={!props.loading() && commentCount() === 0}>
        <box>
          <text fg={theme.textMuted}>No comments</text>
        </box>
      </Show>

      <Show when={!props.loading() && commentCount() > 0}>
        <scrollbox ref={(r) => (scrollbox = r)} flexGrow={1}>
          <For each={props.comments()}>
            {(comment, index) => {
              const isSelected = () => index() === props.selectedIndex();
              const textColor = () =>
                isSelected() && props.focused() ? theme.primary : undefined;

              return (
                <box flexDirection="row" justifyContent="flex-start" gap={1}>
                  <text fg={textColor()}>
                    {getShortFile(comment.file)}
                  </text>
                  <text fg={theme.textMuted}>
                    {`hunk ${comment.hunkIndex + 1}`}
                  </text>
                </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
