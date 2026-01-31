import pc from "picocolors";
import consola from "consola";
import { CLEAR } from "./layout";
import { defaultTheme as theme } from "./theme";

const BAR_WIDTH = 20;

export function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return theme.primary("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

export function createModelProgressHandler(): (event: any) => void {
  let model = "";

  return (event: any) => {
    switch (event.tag) {
      case "model.load":
        consola.info(`Loading model ${theme.primary(event.info.name)}`);
        break;
      case "model.download":
        model = event.info.name;
        consola.info(`Downloading model ${theme.primary(event.info.name)}`);
        break;
      case "model.progress": {
        const percent = (event.downloaded / event.total) * 100;
        const bar = renderProgressBar(percent);
        const percentStr = percent.toFixed(0).padStart(3);
        process.stderr.write(
          `\r${bar} ${pc.bold(percentStr + "%")} ${theme.primary(model)} ${CLEAR}`,
        );
        break;
      }
      case "model.downloaded":
        process.stderr.write(`\r${CLEAR}`);
        consola.success(`Downloaded ${theme.primary(event.info.name)}`);
        break;
    }
  };
}

export function formatStreamError(e: unknown, path: string): string {
  let code = "";
  let msg = "";

  if (e && typeof e === "object") {
    code = (e as any).code ?? "";
    msg = (e as any).message ?? String(e);
  } else {
    msg = String(e);
  }

  if (code === "note.exists") {
    return `Note already exists at ${theme.primary(path)}. Use ${theme.option("--update")} if you meant to update the note.`;
  }

  if (code === "note.duplicate") {
    return `Duplicate content detected for ${theme.primary(path)}. Use ${theme.option("--dupe")} to allow duplicates.`;
  }

  if (code) return `${code}: ${msg}`;
  return msg;
}
