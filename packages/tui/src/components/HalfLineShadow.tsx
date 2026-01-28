import { useTheme } from "../context/theme"

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
  color?: string
}

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
