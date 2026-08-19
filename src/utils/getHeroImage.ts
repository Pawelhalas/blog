import type { CollectionEntry } from "astro:content";

/**
 * The hero image is the first image in a post's body.
 *
 * Pawel's convention (agreed 2026-08-19): every post opens with an image, and
 * that image is also its thumbnail on /posts. Nothing in the frontmatter marks
 * it, so it is read back out of the markdown rather than declared twice.
 *
 * The trade this accepts: a post with no image, or one that opens with prose,
 * gets no thumbnail and no warning. That is tolerable only because the hero
 * image is part of the publishing routine. If that ever stops being true,
 * move to an explicit `ogImage` frontmatter field instead of loosening this.
 */

/**
 * Every image asset, keyed by its `/src`-rooted path.
 *
 * Eager so the lookup is synchronous in component frontmatter, and globbed so
 * the files still go through `astro:assets` — a raw `src` string would skip
 * optimisation and ship the 3MB original. SVG is excluded deliberately: with
 * `experimental.svgOptimizer` on, SVG imports resolve to a component, not
 * `ImageMetadata`, and would not satisfy `<Image />`.
 */
const images = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/**/*.{png,jpg,jpeg,webp,avif,gif}",
  { eager: true }
);

/**
 * Matches the first markdown image, capturing alt text and path.
 *
 * Handles the optional angle-bracket path form `![a](<b c.png>)` and a
 * trailing title `![a](b.png "title")`, both of which CommonMark allows and
 * Typora can emit.
 */
const MARKDOWN_IMAGE =
  /!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/;

/** Resolves `../../assets/images/x.png` against the post's own directory. */
function resolveFromPost(postFilePath: string, relativePath: string) {
  const segments = postFilePath.split("/").slice(0, -1);

  for (const segment of relativePath.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }

  return "/" + segments.join("/").replace(/^\/+/, "");
}

export type HeroImage = { image: ImageMetadata; alt: string };

export function getHeroImage(
  post: CollectionEntry<"posts">
): HeroImage | undefined {
  // MDX entries expose no `body`, and a post whose filePath is missing cannot
  // have its relative image paths resolved. Both degrade to "no thumbnail".
  if (!post.body || !post.filePath) return undefined;

  const match = post.body.match(MARKDOWN_IMAGE);
  if (!match) return undefined;

  const [, alt, path] = match;

  // Remote images can't be optimised at build time and would defeat the point.
  if (/^(https?:)?\/\//.test(path)) return undefined;

  const resolved = path.startsWith("/")
    ? path
    : resolveFromPost(post.filePath, path);

  const image = images[resolved]?.default;
  if (!image) return undefined;

  return { image, alt };
}
