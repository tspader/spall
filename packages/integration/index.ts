import bashHook from "./bash/spall.bash" with { type: "text" };
import zshHook from "./zsh/spall.zsh" with { type: "text" };
import bashSnippet from "./bash/hook.bash" with { type: "text" };
import zshSnippet from "./zsh/hook.zsh" with { type: "text" };

export const hooks = {
  bash: bashHook,
  zsh: zshHook,
} as const;

export const snippets = {
  bash: bashSnippet,
  zsh: zshSnippet,
} as const;

export type Shell = keyof typeof hooks;
export const supportedShells = Object.keys(hooks) as Shell[];
