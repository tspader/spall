import { For, Show, createEffect } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../../context/theme";
import { useReview } from "../../context/review";
import { Title } from "./Section";
import type { CommentWithNote } from "../../context/review";
import type { Patch } from "../../store";

export interface CommentListProps {
  comments: Accessor<CommentWithNote[]>;
  loading: Accessor<boolean>;
  selectedIndex: Accessor<number>;
  focused: Accessor<boolean>;
}

const SCROLL_BUFFER = 2;

function getShortFile(file: string): string {
  const segments = file.split("/");
  return segments[segments.length - 1] || file;
}

function getPatchDisplay(
  patchId: number | null,
  patches: Patch.Info[],
  workingTreePatchId: number | null,
): string {
  if (patchId === null) return "?";
  if (workingTreePatchId !== null && patchId === workingTreePatchId)
    return "WT";
  const patch = patches.find((p) => p.id === patchId);
  if (!patch) return "?";
  return `P${patch.seq}`;
}

export function CommentList(props: CommentListProps) {
  const { theme } = useTheme();
  const review = useReview();
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
      <Title section="comments" />

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
              const bgColor = () =>
                isSelected() && props.focused()
                  ? theme.backgroundElement
                  : theme.backgroundPanel;

              return (
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  backgroundColor={bgColor()}
                >
                  <box flexDirection="row" gap={1}>
                    <text fg={textColor()}>{getShortFile(comment.file)}</text>
                    <text fg={theme.textMuted}>
                      {`${comment.startRow}:${comment.endRow}`}
                    </text>
                  </box>
                  <text fg={theme.textMuted}>
                    {getPatchDisplay(
                      comment.patchId,
                      review.patches(),
                      review.workingTreePatchId(),
                    )}
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
