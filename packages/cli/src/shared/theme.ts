export type Theme = {
  primary: (s: string) => string;
  code: (s: string) => string;
  path: (s: string) => string;
  guide: (s: string) => string;
  header: (s: string) => string;
  command: (s: string) => string;
  arg: (s: string) => string;
  option: (s: string) => string;
  type: (s: string) => string;
  description: (s: string) => string;
  dim: (s: string) => string;
  search: (s?: { suffix?: string; prefix?: string }) => string;
};

let colorEnabled = true;

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

function wrap(fn: (s: string) => string): (s: string) => string {
  return (s: string) => (colorEnabled ? fn(s) : s);
}

function rgb(r: number, g: number, b: number): (s: string) => string {
  return wrap((s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`);
}

function dim(s: string): string {
  if (!colorEnabled) return s;
  return gray(128)(s);
}

const gray = (n: number) => rgb(n, n, n);

const primary = rgb(114, 161, 136);
const option = rgb(212, 212, 161);
const code = rgb(212, 212, 161);
const path = rgb(114, 161, 136);
const guide = rgb(162, 125, 111);
const search = (s?: { suffix?: string; prefix?: string }) => {
  const prefix = s?.prefix ?? "";
  const suffix = s?.suffix ?? "";
  const base = `${prefix}search${suffix}`;
  return colorEnabled ? guide(base) : base;
};

export const defaultTheme: Theme = {
  primary,
  code,
  path,
  guide,
  header: dim,
  command: primary,
  arg: rgb(161, 212, 212),
  option,
  type: dim,
  description: (s) => s,
  dim,
  search,
};
