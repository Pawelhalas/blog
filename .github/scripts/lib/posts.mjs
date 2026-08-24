import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const POSTS_DIR = "src/content/posts";
export const ASSETS_DIR = "src/assets/images";

/**
 * Mirrors the collection glob `**\/[^_]*.{md,mdx}` in `src/content.config.ts`.
 *
 * A leading underscore on ANY path segment excludes the file from the build —
 * `_draft.md` and `_releases/post.md` are both invisible. This function is the
 * whole publish signal: a draft is a path this returns false for, a published
 * post is a path it returns true for.
 */
export function isPublishedPost(path) {
  if (!path.startsWith(`${POSTS_DIR}/`)) return false;
  if (!/\.(md|mdx)$/.test(path)) return false;
  return path
    .slice(POSTS_DIR.length + 1)
    .split("/")
    .every(segment => !segment.startsWith("_"));
}

/** The URL is the filename (`.claude/rules/content-workflow.md`). */
export function slugOf(path) {
  return path.replace(/^.*\//, "").replace(/\.(md|mdx)$/, "");
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * Typora sometimes writes `\---` instead of `---` around frontmatter, which
 * fails YAML parsing and takes the whole build down with it. Catching it here
 * turns a red Cloudflare deploy into a legible workflow failure.
 */
export function assertNoTyporaEscape(text, path) {
  if (/^\\-{3}/m.test(text)) {
    throw new Error(
      `${path}: frontmatter delimiters are escaped as \\--- (Typora quirk). ` +
        `Replace them with plain --- and push again.`
    );
  }
}

export function splitFrontmatter(text) {
  const match = text.match(FRONTMATTER);
  if (!match) return { data: null, yaml: "", body: text };
  return {
    data: parseYaml(match[1]) ?? {},
    yaml: match[1],
    body: text.slice(match[0].length),
  };
}

/** Quotes only when YAML needs it, and never folds a long line. */
function scalar(value) {
  return stringifyYaml(value, { lineWidth: 0 }).trim();
}

/**
 * Built as a string rather than round-tripped through a YAML serialiser.
 *
 * A draft carries `title` and body only, so there is nothing to preserve — and
 * emitting the exact bytes avoids the one failure mode that matters here: a
 * serialiser reformatting `pubDatetime` into something `z.date()` rejects,
 * which fails `astro check` and therefore the deploy.
 */
export function buildFrontmatter({
  title,
  description,
  pubDatetime,
  tags,
  featured,
}) {
  const lines = ["---"];
  lines.push(`title: ${scalar(title)}`);
  lines.push(`description: ${scalar(description)}`);
  lines.push(`pubDatetime: ${pubDatetime}`);
  lines.push("tags:");
  for (const tag of tags) lines.push(`  - ${scalar(tag)}`);
  if (featured) lines.push("featured: true");
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

/**
 * Removes a top-level `featured:` line by line surgery rather than by
 * re-serialising the file. The previous post is already published, so the goal
 * is the smallest possible diff — every other byte of its frontmatter, and any
 * comment in it, stays exactly as the author left it.
 */
export function stripFeatured(text) {
  const match = text.match(FRONTMATTER);
  if (!match) return { text, changed: false };
  const kept = match[1]
    .split("\n")
    .filter(line => !/^featured[ \t]*:/.test(line));
  if (kept.length === match[1].split("\n").length)
    return { text, changed: false };
  const rebuilt = `---\n${kept.join("\n")}\n---\n`;
  return { text: rebuilt + text.slice(match[0].length), changed: true };
}

/**
 * The hero image is the first markdown image in the body — nothing in the
 * frontmatter declares it (`src/utils/getHeroImage.ts`). The path must be
 * relative and under `src/assets/`, or the build ships a dead image without
 * reporting one.
 */
export function heroImageMarkdown(alt, filename) {
  return `![${alt}](../../assets/images/${filename})`;
}

export function withHeroImage(body, markdown) {
  return `\n${markdown}\n\n${body.replace(/^\s+/, "")}`;
}
