/**
 * Shared building blocks for the two Satori-rendered OG cards: the site card
 * (`/og.png`) and the per-post card (`/posts/<slug>/index.png`).
 *
 * Both draw from the same tokens as the site itself, so a link preview reads as
 * the same object as the page behind it. The values are duplicated here as
 * literals because Satori resolves no CSS custom properties - keep them in sync
 * with src/styles/theme.css by hand.
 */
import satori from "satori";
import sharp from "sharp";
import { fontData, experimental_getFontFileURL } from "astro:assets";
import { getFontPathByWeight } from "./getFontPathByWeight";

/** Light-theme Shotengai palette. Mirrors :root in src/styles/theme.css. */
export const ogColors = {
  background: "#f4f0e7",
  foreground: "#1f1c17",
  accent: "#c9522e",
  mutedForeground: "#6b655b",
  border: "#ddd6c8",
} as const;

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Satori's node shape. Loose on purpose - satori's own types are not exported. */
type Node = {
  type: string;
  props: Record<string, unknown>;
};

/**
 * The calm state of the wordmark distortion: beat 25 of the 8s cycle, scaled to
 * 13.5%. Same numbers as `.noise-word.is-calm` in src/styles/distortion.css,
 * in the same band order, so the card shows the hero stopped rather than a
 * lookalike. `accent` marks the three bands that stay lit.
 */
const CALM_BANDS = [
  { dx: -5.3, dy: -0.4, accent: false },
  { dx: 5.8, dy: -0.3, accent: true },
  { dx: -3.5, dy: 0, accent: false },
  { dx: 4.1, dy: 0.4, accent: false },
  { dx: -5.7, dy: 0.4, accent: true },
  { dx: -5.5, dy: 0.4, accent: false },
  { dx: -3.5, dy: -0.3, accent: true },
  { dx: -5.8, dy: 0.1, accent: false },
] as const;

/** IBM Plex Mono is a 600/1000 monospace; the mark tightens it by 0.02em. */
const MONO_ADVANCE = 0.6;
const MONO_TRACKING = -0.02;

/**
 * The site wordmark as eight horizontal bands torn off-register.
 *
 * The site does this with `clip-path` plus `transform`; Satori supports
 * neither reliably, so each band is a fixed-height `overflow: hidden` window
 * with a full copy of the word absolutely positioned inside it and pulled up by
 * the band's own offset. Visually identical, and the band edges land on the
 * same eighths.
 *
 * `amp` is the site's own amplitude, in the site's own pixels: the offsets do
 * not scale with `fontSize`. Scaling them was tried first and read as orange
 * stripes rather than a misprint - a card is looked at once, at thumbnail size,
 * so the word has to stay legible in a way an 8-second animation does not.
 * Pass the amp of whichever site variant the mark is standing in for: 1 for the
 * hero, 0.35 for the header mark.
 */
export function noiseWord(text: string, fontSize: number, amp = 1): Node {
  const height = Math.round(fontSize * 1.2);
  // Eight whole-pixel bands: a fractional band height leaves hairline seams.
  const bandHeight = Math.ceil(height / 8);
  const boxHeight = bandHeight * 8;
  const letterSpacing = MONO_TRACKING * fontSize;
  const textWidth =
    text.length * (MONO_ADVANCE + MONO_TRACKING) * fontSize + letterSpacing;
  // Slack so a shifted band is torn, not clipped, at either edge.
  const pad = Math.ceil(fontSize * 0.12);

  const copy = (color: string, dx: number, dy: number): Node => ({
    type: "div",
    props: {
      style: {
        position: "absolute",
        top: dy,
        left: pad + dx,
        width: textWidth,
        height: boxHeight,
        display: "flex",
        alignItems: "center",
        fontFamily: "IBM Plex Mono",
        fontWeight: 500,
        fontSize,
        letterSpacing,
        lineHeight: 1,
        color,
        whiteSpace: "nowrap",
      },
      children: text,
    },
  });

  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        display: "flex",
        width: textWidth + pad * 2,
        height: boxHeight,
      },
      children: [
        // The undistorted copy the bands are torn from. Carries the word when a
        // band shifts away from it.
        copy(ogColors.foreground, 0, 0),
        ...CALM_BANDS.map((band, i) => ({
          type: "div",
          props: {
            style: {
              position: "absolute",
              top: i * bandHeight,
              left: 0,
              width: textWidth + pad * 2,
              height: bandHeight,
              display: "flex",
              overflow: "hidden",
            },
            children: {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  top: -i * bandHeight,
                  left: 0,
                  width: textWidth + pad * 2,
                  height: boxHeight,
                  display: "flex",
                },
                children: copy(
                  band.accent ? ogColors.accent : ogColors.foreground,
                  band.dx * amp,
                  band.dy * amp
                ),
              },
            },
          },
        })),
      ],
    },
  };
}

/** A section label: mono, small, wide-tracked, lowercase. As used site-wide. */
export function label(
  text: string,
  color: string = ogColors.mutedForeground
): Node {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        fontFamily: "IBM Plex Mono",
        fontSize: 22,
        letterSpacing: 2.6,
        color,
      },
      children: text.toLowerCase(),
    },
  };
}

/**
 * The card shell every OG image shares: paper ground, generous margin, a hairline
 * rule above a footer row.
 */
export function ogFrame(
  body: Node[],
  footer: Node[],
  /**
   * Where the body sits in the space above the rule. Post titles hang from the
   * bottom so a one-line title and a four-line one share a baseline instead of
   * one of them floating in the middle of an empty card.
   */
  bodyAlign: "center" | "flex-end" = "center"
): Node {
  return {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: ogColors.background,
        color: ogColors.foreground,
        fontFamily: "IBM Plex Sans",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: bodyAlign,
              flexGrow: 1,
            },
            children: body,
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              width: "100%",
              paddingTop: 24,
              borderTop: `1px solid ${ogColors.border}`,
            },
            children: footer,
          },
        },
      ],
    },
  };
}

/**
 * Loads the two families the cards use. IBM Plex Sans carries the prose, IBM
 * Plex Mono the wordmark and labels - the same split the site enforces.
 */
export async function loadOgFonts(url: URL) {
  const sans = fontData["--font-sans"];
  const mono = fontData["--font-mono"];

  const paths = {
    sansRegular: getFontPathByWeight(sans, 400),
    sansBold: getFontPathByWeight(sans, 700),
    monoMedium: getFontPathByWeight(mono, 500),
  };

  for (const [name, path] of Object.entries(paths)) {
    if (path === undefined) {
      throw new Error(`Cannot find the font path for ${name}.`);
    }
  }

  const [sansRegular, sansBold, monoMedium] = await Promise.all(
    [paths.sansRegular!, paths.sansBold!, paths.monoMedium!].map(path =>
      fetch(experimental_getFontFileURL(path, url)).then(res =>
        res.arrayBuffer()
      )
    )
  );

  return [
    {
      name: "IBM Plex Sans",
      data: sansRegular!,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "IBM Plex Sans",
      data: sansBold!,
      weight: 700 as const,
      style: "normal" as const,
    },
    {
      name: "IBM Plex Mono",
      data: monoMedium!,
      weight: 500 as const,
      style: "normal" as const,
    },
  ];
}

/** Renders a card node to a PNG response. */
export async function renderOgCard(
  node: Node,
  fonts: Awaited<ReturnType<typeof loadOgFonts>>
) {
  const svg = await satori(node as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    embedFont: true,
    fonts,
  });

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    headers: { "Content-Type": "image/png" },
  });
}
