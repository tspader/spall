import { useTheme } from "../context/theme"

/**
 * Border configuration with all characters blanked out.
 * Used as a base for customBorderChars when you only want specific border elements.
 */
export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

export interface HalfLineShadowProps {
  /** The color of the shadow (typically the panel color above). Defaults to theme.backgroundPanel */
  color?: string
}

/**
 * A half-line shadow effect using the upper half block character (▀).
 * Creates a visual separator that's only half the height of a normal line.
 * 
 * Uses the border system with customBorderChars to automatically fill the width,
 * rather than manually repeating characters.
 */
export function HalfLineShadow(props: HalfLineShadowProps) {
  const { theme } = useTheme()
  const color = () => props.color ?? theme.backgroundPanel

  return (
    <box
      height={1}
      backgroundColor={theme.background}
      border={["top"]}
      borderColor={color()}
      customBorderChars={{
        ...EmptyBorder,
        horizontal: "\u2580",
      }}
    />
  )
}
