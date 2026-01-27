import { For, Show, createEffect } from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { DisplayItem } from "../../lib/tree";
import { useTheme } from "../../context/theme";
import { Section } from "./Section";

export interface FileListProps {
  displayItems: Accessor<DisplayItem[]>;
  /** Index into the files-only list (for navigation) */
  selectedFileIndex: Accessor<number>;
  /** Entry indices in display order (maps navigation index to entry index) */
  fileIndices: Accessor<number[]>;
  loading: Accessor<boolean>;
  focused: Accessor<boolean>;
  /** Check if a file (by path) has any selected hunks */
  hasSelectedHunks: (filePath: string) => boolean;
}

/** Number of items to keep visible below the cursor */
const SCROLL_BUFFER = 4;

export function FileList(props: FileListProps) {
  const { theme } = useTheme();
  let scrollbox: ScrollBoxRenderable | null = null;

  // Check if a display item is the currently selected file
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
    <Section title="Files">
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
        <scrollbox ref={(r) => (scrollbox = r)}>
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
              const statusColor = () => {
                return props.hasSelectedHunks(item.node.path)
                  ? theme.added
                  : theme.textMuted;
              };
              return (
                <box flexDirection="row">
                  <Show when={item.depth > 0}>
                    <text>{"  ".repeat(item.depth)}</text>
                  </Show>
                  <text fg={statusColor()}>{item.node.status} </text>
                  <text fg={textColor()}>{item.node.name}</text>
                </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>
    </Section>
  );
}
