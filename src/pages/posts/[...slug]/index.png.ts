import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  label,
  loadOgFonts,
  noiseWord,
  ogColors,
  ogFrame,
  renderOgCard,
} from "@/utils/ogCard";
import { getPostSlug } from "@/utils/getPostPaths";
import config from "@/config";

/**
 * The per-post link preview.
 *
 * Same shell as the site card, with the roles swapped: the title takes the
 * space the wordmark holds on the homepage, and the mark drops to the footer at
 * the size the header uses it. The title is set in the accent, as it is on the
 * post page itself.
 */
export async function getStaticPaths() {
  if (!config.features.dynamicOgImage) {
    return [];
  }

  const posts = await getCollection("posts").then(p =>
    p.filter(({ data }) => !data.draft && !data.ogImage)
  );

  return posts.map(post => ({
    params: { slug: getPostSlug(post.id, post.filePath) },
    props: post,
  }));
}

export const GET: APIRoute = async ({ props, url }) => {
  if (!config.features.dynamicOgImage) {
    return new Response(null, { status: 404, statusText: "Not found" });
  }

  const fonts = await loadOgFonts(url);

  const card = ogFrame(
    [
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginBottom: 36,
            // Five lines at this size, then clipped. A title that long is a
            // content problem, not a layout one.
            maxHeight: 360,
            overflow: "hidden",
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.15,
            color: ogColors.accent,
          },
          children: props.data.title,
        },
      },
    ],
    [
      // Standing in for the header mark, so the header mark's amplitude.
      noiseWord(config.site.title.toLowerCase(), 26, 0.35),
      label(config.site.author),
    ],
    "flex-end"
  );

  return renderOgCard(card, fonts);
};
