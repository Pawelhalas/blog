import { readFileSync } from "node:fs";

/**
 * Hero image generation.
 *
 * 1536x1024 is a supported gpt-image-1 size and matches the landscape format
 * the style template assumes. Quality is a knob because the tiers differ by an
 * order of magnitude in price (roughly $0.02 to $0.25 an image); `medium` is
 * the default that keeps the yearly cost in the range the design budgeted for.
 *
 * One retry, then give up. A bad image must not block a finished post — the PR
 * opens without one, labelled `needs-image`.
 */
const ENDPOINT = "https://api.openai.com/v1/images/generations";
const SIZE = "1536x1024";

export function buildPrompt({ stylePath, subject, background }) {
  return readFileSync(stylePath, "utf8")
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    .replaceAll("{{SUBJECT}}", subject)
    .replaceAll("{{BACKGROUND}}", background)
    .trim();
}

async function generateOnce(prompt, quality) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: SIZE,
      quality,
      n: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `gpt-image-1 returned ${response.status}: ${(await response.text()).slice(0, 500)}`
    );
  }

  const payload = await response.json();
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1 returned no image data");
  return Buffer.from(b64, "base64");
}

export async function generateImage(prompt, quality = "medium") {
  try {
    return { image: await generateOnce(prompt, quality), error: null };
  } catch (first) {
    try {
      return { image: await generateOnce(prompt, quality), error: null };
    } catch (second) {
      return {
        image: null,
        error: `${first.message} (retry: ${second.message})`,
      };
    }
  }
}
