import config from "@/config";

/**
 * Builds the share links for one post.
 *
 * Both share surfaces call this - the /posts dropdown and the in-post icon
 * row - so the two cannot offer different platforms or different URLs for the
 * same post. Changing what is shareable means editing `shareLinks` in
 * astro-paper.config.ts and nothing else.
 */

/** Casing the platforms use for themselves, where it differs from the key. */
const DISPLAY_NAMES: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
};

export type ShareTarget = {
  name: string;
  platform: string;
  href: string;
  linkTitle?: string;
};

export function getShareTargets(url: string, title: string): ShareTarget[] {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return config.shareLinks.map(({ name, url: prefix, linkTitle }) => ({
    name,
    platform:
      DISPLAY_NAMES[name] ?? name.charAt(0).toUpperCase() + name.slice(1),
    // X is the only endpoint here that also accepts the post title.
    href: `${prefix}${encodedUrl}${name === "x" ? `&text=${encodedTitle}` : ""}`,
    linkTitle,
  }));
}
