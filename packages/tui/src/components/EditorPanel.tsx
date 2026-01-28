import { onMount } from "solid-js";
import type { TextareaRenderable, KeyEvent } from "@opentui/core";
import { useTheme } from "../context/theme";
import { useReview } from "../context/review";

export interface EditorPanelProps {
  file: string;
  hunkIndex: number;
  onClose: () => void;
}

export function EditorPanel(props: EditorPanelProps) {
  const { theme } = useTheme();
  const review = useReview();

  let textareaRef: TextareaRenderable | null = null;
  let initialized = false;

  // Get existing comment for this file+hunk (if any)
  const existingComment = review.getCommentForHunk(props.file, props.hunkIndex);
  const initialContent = existingComment?.noteContent ?? "";

  // Filename is file:hunk (e.g., "CommentList.tsx:1.md")
  const shortFile = props.file.split("/").pop() ?? props.file;
  const filename = `${shortFile}:${props.hunkIndex + 1}.md`;

  // Mark as initialized after first render to ignore the trigger key
  onMount(() => {
    setTimeout(() => {
      initialized = true;
    }, 0);
  });

  const submit = async () => {
    if (!textareaRef) return;

    const content = textareaRef.editBuffer.getText();

    // Don't save empty comments
    if (!content.trim()) {
      props.onClose();
      return;
    }

    if (existingComment) {
      // Update existing comment
      await review.updateComment(existingComment.id, content);
    } else {
      // Create new comment
      await review.createComment(props.file, props.hunkIndex, content);
    }

    props.onClose();
  };

  const handleKeyDown = (e: KeyEvent) => {
    // Ignore the first "c" key that opened this editor
    if (!initialized && e.name === "c") {
      e.preventDefault();
      return;
    }

    // Escape or Ctrl+Enter: submit and close
    if (e.name === "escape" || (e.ctrl && e.name === "return")) {
      e.preventDefault();
      submit();
      return;
    }
  };

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
            textareaRef = r;
          }}
          initialValue={initialContent || undefined}
          focused={true}
          showCursor
          wrapMode="word"
          minHeight={1}
          maxHeight={6}
          width="100%"
          onKeyDown={handleKeyDown}
        />
      </box>

      {/* Footer with filename */}
      <box height={1} paddingLeft={1}>
        <text fg={theme.textMuted}>{filename}</text>
      </box>
    </box>
  );
}
