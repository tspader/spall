import { onMount } from "solid-js";
import { spawn } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import type { TextareaRenderable, KeyEvent } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { useTheme } from "../context/theme";
import { useReview } from "../context/review";

export interface EditorPanelProps {
  file: string;
  hunkIndex: number;
  startRow?: number;
  endRow?: number;
  onClose: () => void;
}

export function EditorPanel(props: EditorPanelProps) {
  const { theme } = useTheme();
  const review = useReview();
  const renderer = useRenderer();

  let textareaRef: TextareaRenderable | null = null;
  let initialized = false;

  // Get existing comment for this file+hunk (if any)
  const existingComment = review.getCommentForHunk(props.file, props.hunkIndex);
  const initialContent = existingComment?.noteContent ?? "";

  // Filename is file:range (e.g., "CommentList.tsx:rows-3-5.md")
  const shortFile = props.file.split("/").pop() ?? props.file;
  const rangeLabel =
    props.startRow && props.endRow
      ? `rows-${props.startRow}-${props.endRow}`
      : `hunk-${props.hunkIndex + 1}`;
  const filename = `${shortFile}:${rangeLabel}.md`;

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

  const openInEditor = async () => {
    if (!textareaRef) return;

    const tmpFile = `/tmp/spall-${filename}`;
    writeFileSync(tmpFile, textareaRef.editBuffer.getText());

    renderer.suspend();

    await new Promise<void>((resolve, reject) => {
      const editor = process.env.EDITOR || "nvim";
      const child = spawn(editor, [tmpFile], { stdio: "inherit" });
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
      );
      child.on("error", reject);
    });

    const content = readFileSync(tmpFile, "utf-8");
    renderer.resume();

    if (!content.trim()) {
      props.onClose();
      return;
    }

    if (existingComment) {
      await review.updateComment(existingComment.id, content);
    } else {
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

    if (e.name === "e" && e.ctrl) {
      e.preventDefault();
      void openInEditor();
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
