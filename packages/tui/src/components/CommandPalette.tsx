import { For, createSignal, createMemo, Show } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { useCommand } from "../context/command"
import { useDialog } from "../context/dialog"
import { useTheme } from "../context/theme"
import { formatKeybind, type Command, type CommandCategory } from "../lib/keybind"

// Category display order
const CATEGORY_ORDER: CommandCategory[] = ["movement", "selection", "actions"]

export function CommandPalette() {
  const dims = useTerminalDimensions()
  const renderer = useRenderer()
  const command = useCommand()
  const dialog = useDialog()
  const { theme } = useTheme()
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  // Only show active commands, deduplicated by title
  const entries = createMemo(() => {
    const active = command.entries().filter((cmd) => cmd.isActive())
    // Deduplicate by title (e.g., multiple "back" commands)
    const seen = new Set<string>()
    return active.filter((cmd) => {
      if (seen.has(cmd.title)) return false
      seen.add(cmd.title)
      return true
    })
  })

  // Group entries by category
  const groupedEntries = createMemo(() => {
    const groups: { category: CommandCategory; commands: Command[] }[] = []
    const byCategory = new Map<CommandCategory, Command[]>()

    for (const cmd of entries()) {
      const list = byCategory.get(cmd.category) ?? []
      list.push(cmd)
      byCategory.set(cmd.category, list)
    }

    // Build groups in display order
    for (const cat of CATEGORY_ORDER) {
      const cmds = byCategory.get(cat)
      if (cmds && cmds.length > 0) {
        groups.push({ category: cat, commands: cmds })
      }
    }

    return groups
  })

  // Flat list of commands for navigation (ignoring category headers)
  const flatEntries = createMemo(() => {
    return groupedEntries().flatMap((g) => g.commands)
  })

  useKeyboard((key) => {
    // Quit app on Ctrl+C or Ctrl+D
    if (key.ctrl && (key.name === "c" || key.name === "d")) {
      renderer.destroy()
      return
    }

    // Close palette on Escape
    if (key.name === "escape") {
      dialog.clear()
      return
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((i) => Math.min(flatEntries().length - 1, i + 1))
      return
    }

    if (key.name === "return") {
      const entry = flatEntries()[selectedIndex()]
      if (entry) {
        dialog.clear()
        entry.onExecute()
      }
      return
    }
  })

  const width = () => Math.min(40, dims().width - 4)

  // Track current index across all commands for selection highlighting
  let currentIndex = 0

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={dims().width}
      height={dims().height}
      justifyContent="center"
      alignItems="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        width={width()}
        flexDirection="column"
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
        paddingBottom={1}
      >
        {/* Title bar */}
        <box height={1} justifyContent="center" paddingLeft={2} paddingRight={2}>
          <text>
            <span style={{ bold: true }}>Commands</span>
          </text>
        </box>

        {/* Separator */}
        <box height={1} />

        {/* Command list grouped by category */}
        <For each={groupedEntries()}>
          {(group, groupIndex) => {
            const startIndex = createMemo(() => {
              let idx = 0
              const groups = groupedEntries()
              for (let i = 0; i < groupIndex(); i++) {
                idx += groups[i]!.commands.length
              }
              return idx
            })

            return (
              <>
                {/* Category header */}
                <Show when={groupIndex() > 0}>
                  <box height={1} />
                </Show>
                <box paddingLeft={2} paddingRight={2}>
                  <text fg={theme.secondary}>
                    <span style={{ bold: true }}>{group.category}</span>
                  </text>
                </box>

                {/* Commands in this category */}
                <For each={group.commands}>
                  {(entry, cmdIndex) => {
                    const globalIndex = () => startIndex() + cmdIndex()
                    return (
                      <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
                        <text fg={globalIndex() === selectedIndex() ? theme.primary : undefined}>
                          {entry.title}
                        </text>
                        <box flexDirection="row" gap={1}>
                          <For each={entry.keybinds}>
                            {(bind) => (
                              <box>
                                <text fg={theme.textMuted}>{formatKeybind(bind)}</text>
                              </box>
                            )}
                          </For>
                        </box>
                      </box>
                    )
                  }}
                </For>
              </>
            )
          }}
        </For>
      </box>
    </box>
  )
}
