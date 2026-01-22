import { createContext, useContext, createSignal, type ParentProps, type Accessor } from "solid-js"

export interface ThemeColors {
  // Backgrounds
  background: string // Main app background
  backgroundPanel: string // Panel backgrounds (slightly lighter)
  backgroundElement: string // Interactive elements, hover states

  // Text
  text: string // Primary text
  textMuted: string // Secondary/gray text

  // Accents
  primary: string // Focused elements, highlights
  secondary: string // Secondary accent color

  // Status
  added: string // Green for additions
  removed: string // Red for removals
  modified: string // Yellow for modifications

  // Indicators
  indicatorDefault: string // Default state for hunk indicators (not hovered, not selected)
}

export type ThemeName = "default" | "system"

interface ThemeContextValue {
  theme: ThemeColors
  themeName: Accessor<ThemeName>
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue>()

// Default theme (opencode dark) - hardcoded values from opencode.json
const defaultTheme: ThemeColors = {
  background: "#0a0a0a", // darkStep1
  backgroundPanel: "#141414", // darkStep2
  backgroundElement: "#1e1e1e", // darkStep3
  text: "#eeeeee", // darkStep12
  textMuted: "#808080", // darkStep11
  primary: "#63a088", // zomp (teal-green)
  secondary: "#fab283", // orange accent
  added: "#284036", // dark green
  removed: "#e06c75", // darkRed
  modified: "#e5c07b", // darkYellow
  indicatorDefault: "#4a4a4a", // medium-dark gray for unselected hunks
}

// System theme - uses terminal colors via ANSI names
const systemTheme: ThemeColors = {
  background: "transparent",
  backgroundPanel: "brightBlack",
  backgroundElement: "gray",
  text: "white",
  textMuted: "brightBlack",
  primary: "cyan",
  secondary: "magenta",
  added: "green",
  removed: "red",
  modified: "yellow",
  indicatorDefault: "gray",
}

const themes: Record<ThemeName, ThemeColors> = {
  default: defaultTheme,
  system: systemTheme,
}

export function ThemeProvider(props: ParentProps) {
  const [themeName, setThemeName] = createSignal<ThemeName>("default")

  const value: ThemeContextValue = {
    get theme() {
      return themes[themeName()]
    },
    themeName,
    setTheme: setThemeName,
  }

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
