import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { Accessor } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { Patch } from "../../store";
import { useTheme } from "../../context/theme";
import { Title } from "./Section";
import type { Git } from "../../lib/git";

export interface PatchListProps {
  patches: Accessor<Patch.Info[]>;
  activePatchId: Accessor<number | null>;
  workspaceEntries: Accessor<Git.Entry[]>;
  loading: Accessor<boolean>;
  selectedIndex: Accessor<number>;
  focused: Accessor<boolean>;
}

/** Number of items to keep visible below the cursor */
const SCROLL_BUFFER = 2;

// Format timestamp to readable time
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function diffStats(content: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of content.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }

  return { added, removed };
}

function sumEntryStats(entries: Git.Entry[]): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (const e of entries) {
    const s = diffStats(e.content);
    added += s.added;
    removed += s.removed;
  }
  return { added, removed };
}

export function PatchList(props: PatchListProps) {
  const { theme } = useTheme();
  let scrollbox: ScrollBoxRenderable | null = null;

  const [now, setNow] = createSignal(Date.now());

  onMount(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      // Align to minute boundary so the display flips on :00.
      const ms = Date.now();
      const nextMinute = Math.ceil(ms / 60000) * 60000;
      const delay = Math.max(0, nextMinute - ms);
      const timeout = setTimeout(() => {
        setNow(Date.now());
        interval = setInterval(() => setNow(Date.now()), 60000);
      }, delay);
      onCleanup(() => clearTimeout(timeout));
    };
    start();
    onCleanup(() => {
      if (interval) clearInterval(interval);
    });
  });

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

  // Include workspace as item 0, then patches
  const items = () => {
    const patchList = props.patches();
    // Workspace entry at index 0, then patches sorted by seq descending (newest first)
    // Use current time for workspace timestamp
    return [
      { type: "workspace" as const, id: null, seq: -1, createdAt: now() },
      ...patchList
        .slice()
        .sort((a, b) => b.seq - a.seq)
        .map((p) => ({ type: "patch" as const, ...p })),
    ];
  };

  const patchCount = () => props.patches().length;

  return (
    <box flexDirection="column">
      <Title section="patches" />
      <Show when={props.loading()}>
        <box>
          <text fg={theme.textMuted}>Loading...</text>
        </box>
      </Show>

      <Show when={!props.loading() && patchCount() === 0}>
        <box>
          <box flexDirection="row" justifyContent="space-between">
            <box flexDirection="row" gap={1}>
              <Show when={props.activePatchId() === null}>
                <text fg={theme.primary}>▸</text>
              </Show>
              <Show when={props.activePatchId() !== null}>
                <text fg={theme.textMuted}> </text>
              </Show>
              <text fg={props.focused() ? theme.primary : undefined}>
                Working tree
              </text>

              {(() => {
                const s = sumEntryStats(props.workspaceEntries());
                if (s.added === 0 && s.removed === 0) return null;
                return (
                  <>
                    <text fg={theme.diffSignAdded}>+</text>
                    <text fg={theme.textMuted}>{s.added}</text>
                    <text fg={theme.diffSignRemoved}>-</text>
                    <text fg={theme.textMuted}>{s.removed}</text>
                  </>
                );
              })()}
            </box>
            <text fg={theme.textMuted}>{formatTime(now())}</text>
          </box>
        </box>
      </Show>

      <Show when={!props.loading() && patchCount() > 0}>
        <scrollbox ref={(r) => (scrollbox = r)} flexGrow={1}>
          <For each={items()}>
            {(item, index) => {
              const isSelected = () => index() === props.selectedIndex();
              const isActive = () => {
                if (item.type === "workspace")
                  return props.activePatchId() === null;
                return props.activePatchId() === item.id;
              };
              const textColor = () =>
                isActive() ? theme.primary : undefined;
              const bgColor = () =>
                isSelected() && props.focused()
                  ? theme.backgroundElement
                  : theme.backgroundPanel;

              const label = () =>
                item.type === "workspace" ? "Working tree" : `P${item.seq}`;

              const delta = () =>
                item.type === "workspace"
                  ? sumEntryStats(props.workspaceEntries())
                  : diffStats(item.content);

              return (
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  backgroundColor={bgColor()}
                >
                  <box flexDirection="row" gap={1}>
                    <text fg={textColor()}>{label()}</text>
                    <Show
                      when={
                        delta() && (delta().added > 0 || delta().removed > 0)
                      }
                    >
                      <text fg={theme.diffSignAdded}>+{delta().added}</text>
                      <text fg={theme.diffSignRemoved}>-{delta().removed}</text>
                    </Show>
                  </box>

                  <text fg={theme.textMuted}>{formatTime(item.createdAt)}</text>
                </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
