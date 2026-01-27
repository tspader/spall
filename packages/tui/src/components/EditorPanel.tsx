import { onMount } from "solid-js"
import type { Accessor } from "solid-js"
import type { TextareaRenderable, KeyEvent } from "@opentui/core"
import { useTheme } from "../context/theme"
import { HalfLineShadow } from "./HalfLineShadow"

export interface EditorPanelProps {
  filename: Accessor<string>
  initialContent: Accessor<string>
  focused: Accessor<boolean>
  onTextareaRef: (ref: TextareaRenderable) => void
  onSubmit: (content: string) => void
}

export function EditorPanel(props: EditorPanelProps) {
  const { theme } = useTheme()
  let textareaRef: TextareaRenderable | null = null
  let initialized = false

  // Mark as initialized after first render to ignore the trigger key
  onMount(() => {
    // Use setTimeout to delay past the initial key event
    setTimeout(() => {
      initialized = true
    }, 0)
  })

  const handleKeyDown = (e: KeyEvent) => {
    // Ignore the first "c" key that opened this editor
    if (!initialized && e.name === "c") {
      e.preventDefault()
    }
  }

  return (
    <box
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      flexShrink={0}
    >
      {/* Textarea with padding */}
      <box paddingLeft={1} paddingRight={1} paddingTop={1} paddingBottom={1}>
        <textarea
          ref={(r: TextareaRenderable) => {
            textareaRef = r
            props.onTextareaRef(r)
          }}
          initialValue={props.initialContent() || undefined}
          focused={true}
          showCursor
          wrapMode="word"
          minHeight={1}
          maxHeight={6}
          width="100%"
          onKeyDown={handleKeyDown}
          onSubmit={() => {
            if (textareaRef) {
              const content = textareaRef.editBuffer.getText()
              props.onSubmit(content)
            }
          }}
        />
      </box>

      {/* Footer with filename */}
      <box height={1} paddingLeft={1}>
        <text fg={theme.textMuted}>{props.filename()}</text>
      </box>
    </box>
  )
}
