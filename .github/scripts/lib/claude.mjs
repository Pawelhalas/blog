import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

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

/**
 * Structured output, schema-enforced.
 *
 * This replaced "ask for JSON in the prompt, then JSON.parse the text", which
 * failed on the very first real post: the model wrote correct Polish prose
 * containing typographic quotes — `tagi: „AI" i „projekty"` — and the straight
 * closing quote terminated the JSON string early. Correct output, unparseable
 * transport. Any prose language with its own quotation marks would have done
 * the same, so it was a matter of when, not if.
 *
 * `messages.parse` constrains generation to the schema, so malformed JSON is
 * not something to defend against — it cannot be produced.
 */
export async function askStructured({
  system,
  prompt,
  schema,
  maxTokens = 16000,
}) {
  const message = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (message.stop_reason === "refusal") {
    const detail = message.stop_details?.explanation ?? "no explanation given";
    throw new Error(`Claude declined the request (${detail})`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude hit max_tokens — the response was truncated");
  }
  if (!message.parsed_output) {
    throw new Error(
      "Claude returned no parseable output for the requested schema"
    );
  }
  return message.parsed_output;
}
