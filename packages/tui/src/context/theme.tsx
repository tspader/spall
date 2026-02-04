import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { SyntaxStyle, type ThemeTokenStyle } from "@opentui/core";

export interface ThemeColors {
  // Backgrounds
  background: string; // Main app background
  backgroundPanel: string; // Panel backgrounds (slightly lighter)
  backgroundElement: string; // Interactive elements, hover states

  // Text
  text: string; // Primary text
  textMuted: string; // Secondary/gray text

  // Accents
  primary: string; // Focused elements, highlights
  primaryDark: string; // Focused elements, highlights
  secondary: string;
  secondaryDark: string;

  // Status
  added: string; // Green for additions
  removed: string; // Red for removals
  modified: string; // Yellow for modifications

  // Indicators
  indicatorDefault: string; // Default state for hunk indicators (not hovered, not selected)

  // Connection status
  connected: string; // Bright green for connected
  disconnected: string; // Bright red for disconnected

  // Diff backgrounds (for syntax-highlighted diff view)
  diffAddedBg: string; // Background for added lines
  diffRemovedBg: string; // Background for removed lines
  diffContextBg: string; // Background for unchanged context lines

  // Diff sign colors (the "+" and "-" indicators)
  diffSignAdded: string; // Color for "+" sign
  diffSignRemoved: string; // Color for "-" sign

  // Diff line number styling
  diffAddedLineNumberBg: string;
  diffRemovedLineNumberBg: string;
  diffLineNumberFg: string;

  // Syntax highlighting colors
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxFunction: string;
  syntaxVariable: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxOperator: string;
  syntaxPunctuation: string;
}

export type ThemeName = "default" | "system";

interface ThemeContextValue {
  theme: ThemeColors;
  themeName: Accessor<ThemeName>;
  setTheme: (name: ThemeName) => void;
  syntax: Accessor<SyntaxStyle>;
}

const ThemeContext = createContext<ThemeContextValue>();

// Default theme (opencode dark) - hardcoded values from opencode.json
const defaultTheme: ThemeColors = {
  background: "#0a0a0a", // darkStep1
  backgroundPanel: "#141414", // darkStep2
  backgroundElement: "#1e1e1e", // darkStep3
  text: "#eeeeee", // darkStep12
  textMuted: "#808080", // darkStep11
  primary: "#63a088", // zomp (teal-green)
  primaryDark: "#1d2f28",
  secondary: "#608999", // orange accent
  secondaryDark: "#182226", // orange accent
  added: "#284036", // dark green
  removed: "#e06c75", // darkRed
  modified: "#e5c07b", // darkYellow
  indicatorDefault: "#4a4a4a", // medium-dark gray for unselected hunks
  connected: "#73d936", // bright green
  disconnected: "#ff5555", // bright red

  // Diff styling (ayu-inspired colors)
  diffAddedBg: "#20303b", // dark blue-green tint
  diffRemovedBg: "#37222c", // dark red tint
  diffContextBg: "111111",
  diffSignAdded: "#b8db87", // bright green for "+"
  diffSignRemoved: "#e26a75", // bright red for "-"
  diffAddedLineNumberBg: "#1a2a30",
  diffRemovedLineNumberBg: "#2d1a22",
  diffLineNumberFg: "#888888",

  // Syntax highlighting (ayu-inspired)
  syntaxComment: "#5c6773",
  syntaxKeyword: "#ff7733",
  syntaxFunction: "#ffb454",
  syntaxVariable: "#cbccc6",
  syntaxString: "#bae67e",
  syntaxNumber: "#ffcc66",
  syntaxType: "#73d0ff",
  syntaxOperator: "#f29e74",
  syntaxPunctuation: "#cbccc6",
};

// System theme - uses terminal colors via ANSI names
const systemTheme: ThemeColors = {
  background: "transparent",
  backgroundPanel: "brightBlack",
  backgroundElement: "gray",
  text: "white",
  textMuted: "brightBlack",
  primary: "cyan",
  primaryDark: "blue",
  secondary: "red",
  secondaryDark: "magenta",
  added: "green",
  removed: "red",
  modified: "yellow",
  indicatorDefault: "gray",
  connected: "brightGreen",
  disconnected: "brightRed",

  // Diff styling (ANSI-based)
  diffAddedBg: "green",
  diffRemovedBg: "red",
  diffContextBg: "transparent",
  diffSignAdded: "brightGreen",
  diffSignRemoved: "brightRed",
  diffAddedLineNumberBg: "green",
  diffRemovedLineNumberBg: "red",
  diffLineNumberFg: "brightBlack",

  // Syntax highlighting (ANSI-based)
  syntaxComment: "brightBlack",
  syntaxKeyword: "magenta",
  syntaxFunction: "blue",
  syntaxVariable: "white",
  syntaxString: "green",
  syntaxNumber: "yellow",
  syntaxType: "cyan",
  syntaxOperator: "white",
  syntaxPunctuation: "white",
};

const themes: Record<ThemeName, ThemeColors> = {
  default: defaultTheme,
  system: systemTheme,
};

// Map tree-sitter scopes to theme colors
function getSyntaxRules(theme: ThemeColors): ThemeTokenStyle[] {
  return [
    {
      scope: ["comment", "comment.documentation"],
      style: { foreground: theme.syntaxComment, italic: true },
    },
    {
      scope: ["string", "string.special", "character"],
      style: { foreground: theme.syntaxString },
    },
    {
      scope: ["number", "boolean", "constant"],
      style: { foreground: theme.syntaxNumber },
    },
    {
      scope: [
        "keyword",
        "keyword.return",
        "keyword.conditional",
        "keyword.repeat",
      ],
      style: { foreground: theme.syntaxKeyword, italic: true },
    },
    {
      scope: ["keyword.function", "keyword.import"],
      style: { foreground: theme.syntaxKeyword },
    },
    {
      scope: ["function", "function.call", "function.method", "constructor"],
      style: { foreground: theme.syntaxFunction },
    },
    {
      scope: ["variable", "variable.parameter", "variable.member"],
      style: { foreground: theme.syntaxVariable },
    },
    {
      scope: ["type", "type.builtin", "module"],
      style: { foreground: theme.syntaxType },
    },
    {
      scope: ["operator", "keyword.operator"],
      style: { foreground: theme.syntaxOperator },
    },
    {
      scope: ["punctuation", "punctuation.delimiter", "punctuation.bracket"],
      style: { foreground: theme.syntaxPunctuation },
    },
    {
      scope: ["property"],
      style: { foreground: theme.syntaxVariable },
    },
    {
      scope: ["tag", "tag.attribute"],
      style: { foreground: theme.syntaxKeyword },
    },
  ];
}

export function ThemeProvider(props: ParentProps) {
  const [themeName, setThemeName] = createSignal<ThemeName>("default");

  // Create syntax style that updates when theme changes
  const syntax = createMemo(() => {
    const theme = themes[themeName()];
    return SyntaxStyle.fromTheme(getSyntaxRules(theme));
  });

  const value: ThemeContextValue = {
    get theme() {
      return themes[themeName()];
    },
    themeName,
    setTheme: setThemeName,
    syntax,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
