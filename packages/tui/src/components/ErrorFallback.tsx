import { useKeyboard, useRenderer } from "@opentui/solid"

export interface ErrorFallbackProps {
  error: Error
  reset: () => void
}

export function ErrorFallback(props: ErrorFallbackProps) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    if (key.name === "r") {
      props.reset()
    }
    if (key.name === "q" || key.raw === "\u0003") {
      renderer.destroy()
    }
  })

  return (
    <box flexDirection="column" padding={2}>
      <text fg="red">Error: {props.error.message}</text>
      <text></text>
      <text fg="gray">Press 'r' to retry or 'q' to quit</text>
    </box>
  )
}
