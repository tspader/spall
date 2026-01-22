import { createContext, useContext, createSignal, type ParentProps, type Accessor } from "solid-js"
import type { Command } from "../lib/keybind"

interface CommandContextValue {
  register: (commands: Accessor<Command[]>) => void
  entries: Accessor<Command[]>
}

const CommandContext = createContext<CommandContextValue>()

export function CommandProvider(props: ParentProps) {
  const [registrations, setRegistrations] = createSignal<Accessor<Command[]>[]>([])

  const value: CommandContextValue = {
    register: (commands) => {
      setRegistrations((prev) => [...prev, commands])
    },
    entries: () => registrations().flatMap((r) => r()),
  }

  return (
    <CommandContext.Provider value={value}>
      {props.children}
    </CommandContext.Provider>
  )
}

export function useCommand(): CommandContextValue {
  const ctx = useContext(CommandContext)
  if (!ctx) throw new Error("useCommand must be used within CommandProvider")
  return ctx
}
