import { join, dirname } from "path";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const root = dirname(import.meta.dirname);

const frontmatter = readFileSync(
  join(root, "claude/content/frontmatter.md"),
  "utf-8",
);
const body = readFileSync(join(root, "content/prime.md"), "utf-8");
const footer = readFileSync(
  join(root, "claude/content/footer.md"),
  "utf-8",
);

const skill = frontmatter.trimEnd() + "\n\n" + body.trimEnd() + "\n\n" + footer;

const out = join(root, "claude/plugin/skills/spall/SKILL.md");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, skill);

console.log("built", out);
