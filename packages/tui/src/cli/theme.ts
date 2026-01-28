export type Theme = {
  header: (s: string) => string;
  command: (s: string) => string;
  arg: (s: string) => string;
  option: (s: string) => string;
  type: (s: string) => string;
  description: (s: string) => string;
  dim: (s: string) => string;
};

function rgb(r: number, g: number, b: number): (s: string) => string {
  return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`;
}

export const defaultTheme: Theme = {
  header: dim,
  command: rgb(96, 161, 127),
  arg: rgb(126, 230, 230),
  option: rgb(230, 230, 126),
  type: dim,
  description: (s) => s,
  dim,
};
