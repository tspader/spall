import { defaultTheme, type Theme } from "./theme";
import { help, type CliDef } from "./yargs";

let activeCli: CliDef | null = null;

export function setActiveCli(def: CliDef): void {
  activeCli = def;
}

export function printHelp(t: Theme = defaultTheme): void {
  if (!activeCli) {
    throw new Error(
      "printHelp() called before setActiveCli(). Set it in your CLI entrypoint.",
    );
  }
  help(activeCli, activeCli.name, [], t);
}
