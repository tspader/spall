import type { ParsedKey } from "@opentui/core"

export interface KeybindInfo {
  name: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
}

export type CommandCategory = "movement" | "selection" | "actions"

export interface Command {
  id: string
  title: string
  category: CommandCategory
  keybinds: KeybindInfo[]
  isActive: () => boolean
  onExecute: () => void
}

/** Check if a ParsedKey matches a KeybindInfo */
export function matchKey(key: ParsedKey, bind: KeybindInfo): boolean {
  if (key.name !== bind.name) return false
  if ((bind.ctrl ?? false) !== key.ctrl) return false
  if ((bind.meta ?? false) !== key.meta) return false
  if ((bind.shift ?? false) !== key.shift) return false
  return true
}

/** Check if a ParsedKey matches any of the bindings */
export function matchAny(key: ParsedKey, binds: KeybindInfo[]): boolean {
  return binds.some((bind) => matchKey(key, bind))
}

/** Format a keybind for display (e.g., "C-c", "return", "a") */
export function formatKeybind(bind: KeybindInfo): string {
  const parts: string[] = []
  if (bind.ctrl) parts.push("C")
  if (bind.meta) parts.push("M")
  if (bind.shift) parts.push("S")
  parts.push(bind.name)
  return parts.join("-")
}
