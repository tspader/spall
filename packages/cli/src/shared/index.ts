export { table, cols, CLEAR, cleanEscapes } from "./layout";
export { type Theme, defaultTheme } from "./theme";
export { setColorEnabled } from "./theme";
export {
  displayResults,
  displayPathTree,
  displayLlmSearch,
  displayLlmFetch,
  printQueryId,
  highlightSnippet,
  type ColumnDef,
  type DisplayOpts,
  type PathTreeOpts,
  type LlmSearchOpts,
  type LlmFetchOpts,
} from "./display";
export {
  build,
  help,
  type CommandDef,
  type CliDef,
  type OptionDef,
  type PositionalDef,
} from "./yargs";
export {
  renderProgressBar,
  createModelProgressHandler,
  formatStreamError,
} from "./progress";

export {
  resolveProjectScope,
  gitRoot,
  createEphemeralQuery,
  type ResolvedProjectScope,
} from "./workspace";

export {
  noteTreeEntries,
  noteDirEntries,
  type NotePathId,
  type NoteTreeEntry,
} from "./tree";
