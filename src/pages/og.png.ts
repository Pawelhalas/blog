import type { APIRoute } from "astro";
import {
  label,
  loadOgFonts,
  noiseWord,
  ogColors,
  ogFrame,
  renderOgCard,
} from "@/utils/ogCard";
import config from "@/config";

/**
 * The site-wide link preview: the homepage hero, held still.
 *
 * Same two-part line, same wordmark with the same torn bands, same paper. A
 * card pasted into LinkedIn or Slack should be recognisable as the page it
 * points at before the reader has read a word of it.
 */
export const GET: APIRoute = async context => {
  const fonts = await loadOgFonts(context.url);

  // The quiet half of the site's line. It is written into the homepage markup
  // rather than the config (src/pages/index.astro), so it is repeated here.
  const EYEBROW = "więcej hałasu";

  const card = ogFrame(
    [
      label(EYEBROW),
      {
        type: "div",
        props: {
          style: { display: "flex", marginTop: 18 },
          // The hero's role, so the hero's amplitude.
          children: noiseWord(config.site.title.toLowerCase(), 108, 1),
        },
      },
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginTop: 34,
            fontSize: 34,
            color: ogColors.mutedForeground,
          },
          children: config.site.description,
        },
      },
    ],
    [
      label(new URL(config.site.url).hostname, ogColors.foreground),
      label(config.site.author),
    ]
  );

  return renderOgCard(card, fonts);
};
