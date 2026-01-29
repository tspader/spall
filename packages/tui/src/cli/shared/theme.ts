export type Theme = {
  primary: (s: string) => string;
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
  return gray(128)(s)
  //return `\x1b[2m${s}\x1b[22m`;
}

const gray = (n: number) => rgb(n, n, n)

const primary = rgb(114, 161, 136);

export const defaultTheme: Theme = {
  primary,
  header: dim,
  command: primary,
  arg: rgb(161, 212, 212),
  option: rgb(212, 212, 161),
  type: dim,
  description: (s) => s,
  dim,
};
