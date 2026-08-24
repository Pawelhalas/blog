import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5";

let client;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

function textOf(message) {
  if (message.stop_reason === "refusal") {
    const detail = message.stop_details?.explanation ?? "no explanation given";
    throw new Error(`Claude declined the request (${detail})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude hit max_tokens — the response was truncated");
  }
  return message.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("")
    .trim();
}

export async function ask({ system, prompt, maxTokens = 16000 }) {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return textOf(message);
}

/**
 * Streaming for the orthography pass: its output is the length of the whole
 * post, and a non-streaming request with a `max_tokens` that large risks an
 * HTTP timeout.
 */
export async function askLong({ system, prompt, maxTokens = 64000 }) {
  const stream = anthropic().messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return textOf(await stream.finalMessage());
}

/** Tolerates a ```json fence around the object, which the prompt asks it to omit. */
export function parseJson(text, what) {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch (error) {
    throw new Error(
      `could not parse ${what} as JSON: ${error.message}\n---\n${text}`
    );
  }
}
