import { For, Show, createEffect } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { DisplayItem } from "../../lib/tree";
import { useTheme } from "../../context/theme";
import { Title } from "./Section";
import type { Git } from "../../lib/git";

export interface FileListProps {
  displayItems: Accessor<DisplayItem[]>;
  selectedFileIndex: Accessor<number>;
  fileIndices: Accessor<number[]>;
  entries: Accessor<Git.Entry[]>;
  loading: Accessor<boolean>;
  focused: Accessor<boolean>;
}

const SCROLL_BUFFER = 2;

function fileDiffStats(content: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return { added, removed };
}

export function FileList(props: FileListProps) {
  const { theme } = useTheme();
  let scrollbox: ScrollBoxRenderable | null = null;

  const isSelected = (item: DisplayItem): boolean => {
    if (item.node.type !== "file") return false;
    const selectedEntryIndex = props.fileIndices()[props.selectedFileIndex()];
    return item.node.entryIndex === selectedEntryIndex;
  };

  // Find the display index for the currently selected file
  const getSelectedDisplayIndex = (): number => {
    const selectedEntryIndex = props.fileIndices()[props.selectedFileIndex()];
    return props
      .displayItems()
      .findIndex(
        (item) =>
          item.node.type === "file" &&
          item.node.entryIndex === selectedEntryIndex,
      );
  };

  // Scroll to keep selection visible with buffer
  createEffect(() => {
    const displayIndex = getSelectedDisplayIndex();
    if (displayIndex < 0 || !scrollbox) return;

    const viewportHeight = scrollbox.viewport.height;
    const scrollTop = scrollbox.scrollTop;
    const itemTop = displayIndex;
    const itemBottom = displayIndex + 1;

    // Scroll up if item is above viewport (with buffer at top)
    if (itemTop < scrollTop + SCROLL_BUFFER) {
      scrollbox.scrollTo(Math.max(0, itemTop - SCROLL_BUFFER));
    }
    // Scroll down if item is below viewport (with buffer at bottom)
    else if (itemBottom > scrollTop + viewportHeight - SCROLL_BUFFER) {
      scrollbox.scrollTo(itemBottom - viewportHeight + SCROLL_BUFFER);
    }
  });

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
    >
      <Title section="files" />

      <Show when={props.loading()}>
        <box>
          <text>Loading...</text>
        </box>
      </Show>

      <Show when={!props.loading() && props.displayItems().length === 0}>
        <box>
          <text>No changes found</text>
        </box>
      </Show>

      <Show when={!props.loading() && props.displayItems().length > 0}>
        <scrollbox ref={(r) => (scrollbox = r)} flexGrow={1}>
          <For each={props.displayItems()}>
            {(item) => {
              if (item.node.type === "dir") {
                return (
                  <box flexDirection="row">
                    <Show when={item.depth > 0}>
                      <text>{"  ".repeat(item.depth)}</text>
                    </Show>
                    <text>{"\u25BE "}</text>
                    <text>{item.node.name}</text>
                  </box>
                );
              }

              const textColor = () =>
                isSelected(item) ? theme.primary : undefined;

              const bgColor = () =>
                isSelected(item) ? theme.backgroundElement : theme.backgroundPanel;

              const entryIndex = item.node.entryIndex;
              const entry =
                typeof entryIndex === "number"
                  ? props.entries()[entryIndex]
                  : undefined;
              const stats = entry ? fileDiffStats(entry.content) : null;

              return (
                  <box flexDirection="row" gap={1} backgroundColor={bgColor()}>
                    <Show when={item.depth > 0}>
                      <text>{"  ".repeat(item.depth)}</text>
                    </Show>
                    <text fg={theme.textMuted}>{item.node.status}</text>
                    <text fg={textColor()}>{item.node.name}</text>
                    <Show
                      when={!!stats && (stats.added > 0 || stats.removed > 0)}
                    >
                      <text fg={theme.diffSignAdded}>{`+${stats!.added}`}</text>
                    <text fg={theme.diffSignRemoved}>{`-${stats!.removed}`}</text>
                    </Show>

                  </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
