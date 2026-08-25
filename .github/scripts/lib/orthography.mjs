import { readFileSync } from "node:fs";

/**
 * Orthography only — no rewriting, no improvements. The copy is Pawel's.
 *
 * The first design asked the model to return the whole post corrected, then
 * diffed the two and discarded anything structural. It failed on both real
 * runs — 713 tokens back as 709, 809 back as 807 — so the guard worked and the
 * feature produced nothing. Asking a model to reproduce 700 tokens verbatim and
 * change four characters is asking for the one thing models are worst at.
 *
 * So the model no longer sees a job that involves emitting the post. It returns
 * a list of single-word corrections; this module verifies each one against the
 * real text and applies them mechanically. Rewriting is not guarded against —
 * it is unrepresentable, because the post is never in the model's output.
 */

/** `["word", " ", "word", "\n\n", "word"]` — words at even indices. */
const tokenise = text => text.split(/(\s+)/);

const isParagraphBreak = separator => /\n[ \t]*\n/.test(separator);

/** Trailing/leading punctuation is not part of the word. */
const bare = word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Tokens that look like machinery rather than prose. A "correction" to any of
 * these is a bug, not a fix.
 */
const MACHINERY = /```|\]\(|^https?:|^[./~]|\/|^`|`$|^#|^\{|^</;

export function loadAllowlist(path) {
  return new Set(
    readFileSync(path, "utf8")
      .split("\n")
      .map(line => line.replace(/#.*$/, "").trim())
      .filter(Boolean)
  );
}

/**
 * Polish inflects proper nouns, so exact matching is not enough: the allowlist
 * says `Anthropic` but the text says `Anthropica`, `Anthropicowi`, `Anthropiciem`.
 * A first pass accepted "Anthropica → Antropika" for exactly this reason — five
 * occurrences of a company name, silently "corrected".
 *
 * So an entry also protects anything it is a prefix of. Guarded at four
 * characters, because a two-letter entry like `AI` would otherwise shield every
 * word starting with those letters.
 */
function isProtected(word, allowlist) {
  const lower = word.toLowerCase();
  for (const term of allowlist) {
    const t = term.toLowerCase();
    if (lower === t) return true;
    if (t.length >= 4 && lower.startsWith(t)) return true;
  }
  return false;
}

/**
 * Checks every proposed correction against the actual post.
 *
 * A correction survives only if it is one whole word replaced by one whole
 * word, the word is prose rather than markup, it is not an allowlisted proper
 * noun, and it genuinely occurs in the text. That last check is the one that
 * matters most: it makes a hallucinated correction — a fix to a word the post
 * does not contain — impossible to apply.
 */
export function verifyCorrections(text, corrections, allowlist = new Set()) {
  const tokens = tokenise(text);

  // Word position -> paragraph number, walked once.
  const paragraphAt = [];
  let paragraph = 1;
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 1) {
      if (isParagraphBreak(tokens[i])) paragraph++;
      continue;
    }
    paragraphAt[i] = paragraph;
  }

  const accepted = [];
  const rejected = [];

  for (const correction of corrections) {
    const before = (correction.before ?? "").trim();
    const after = (correction.after ?? "").trim();
    const reason = correction.reason ?? "";
    const drop = why => rejected.push({ before, after, reason, why });

    if (!before || !after) {
      drop("empty");
    } else if (/\s/.test(before) || /\s/.test(after)) {
      drop("not a single word");
    } else if (before === after) {
      drop("no change");
    } else if (MACHINERY.test(before) || MACHINERY.test(after)) {
      drop("not prose");
    } else if (isProtected(bare(before), allowlist)) {
      drop("allowlisted term");
    } else {
      const hits = [];
      for (let i = 0; i < tokens.length; i += 2) {
        if (bare(tokens[i]) === before) hits.push(i);
      }
      if (hits.length === 0) drop("word does not appear in the post");
      else
        accepted.push({
          before,
          after,
          reason,
          hits,
          paragraph: paragraphAt[hits[0]],
          occurrences: hits.length,
        });
    }
  }

  return { accepted, rejected };
}

/**
 * Applies accepted corrections in place, preserving every byte around them.
 *
 * Rebuilt from the original token list, so line wrapping, double spaces and
 * trailing whitespace all survive — a three-word fix stays a three-word diff
 * rather than reflowing the whole post.
 */
export function applyCorrections(text, accepted) {
  const tokens = tokenise(text);
  for (const { before, after, hits } of accepted) {
    for (const i of hits) {
      // Replaced via a function so `$` in the correction is not read as a
      // replacement pattern.
      tokens[i] = tokens[i].replace(before, () => after);
    }
  }
  return tokens.join("");
}
