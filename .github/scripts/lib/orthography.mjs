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

/**
 * Strips diacritics and case, so two spellings of the same word compare equal.
 *
 * The explicit ł handling is not decoration. Polish ł has no canonical
 * decomposition, so NFD leaves it untouched while it happily reduces ę to e —
 * meaning `bylem → byłem`, one of the commonest Polish typos, looks like a
 * different word to a naive implementation and would be refused.
 */
const fold = word =>
  word
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/ł/g, "l");

/**
 * What kind of change a correction actually makes.
 *
 * This is the load-bearing guarantee of the whole pipeline now that nobody
 * reads the diff before it is live: **the automation may fix how a word is
 * spelled and may never choose a different word.**
 *
 *   diacritics  zgineło → zginęło    the same letters, correctly accented
 *   case        polska  → Polska     the same letters, correctly capitalised
 *   split       napewno → na pewno   the same letters, correctly spaced
 *   other       morze   → może       a DIFFERENT word
 *
 * Only the first three are ever applied. `other` is reported and left alone,
 * because "morze" and "może" are both real Polish words and nothing here can
 * know which one Pawel meant — that is a judgement about his content, not his
 * orthography, and it is not the automation's to make.
 *
 * The cost is accepted deliberately: a genuine typo needing a letter added or
 * removed (`widzalem → widziałem`) classifies as `other` and survives to the
 * published post. Reporting a real typo is a smaller failure than silently
 * replacing a word the author chose.
 */
export function correctionClass(before, after) {
  const folded = fold(before);
  const foldedAfter = fold(after);

  if (/\s/.test(after)) {
    return foldedAfter.replace(/\s+/g, "") === folded ? "split" : "other";
  }
  if (folded !== foldedAfter) return "other";
  return before.toLowerCase() === after.toLowerCase() ? "case" : "diacritics";
}

/** The classes safe to apply unattended. */
const APPLICABLE = new Set(["diacritics", "case", "split"]);

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
  // Three buckets, not two: `flagged` is a correction that survived every
  // structural check and was refused only because applying it would change
  // which word the sentence contains. Those are worth reporting — they are
  // often real errors — but never worth applying without Pawel.

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
  const flagged = [];

  for (const correction of corrections) {
    const before = (correction.before ?? "").trim();
    const after = (correction.after ?? "").trim();
    const reason = correction.reason ?? "";
    const drop = why => rejected.push({ before, after, reason, why });

    if (!before || !after) {
      drop("empty");
      continue;
    }
    // `before` must still be one word — it has to match a single token in the
    // post. `after` may contain a space, but only as a split: see
    // correctionClass, which is what decides that.
    if (/\s/.test(before)) {
      drop("not a single word");
      continue;
    }
    if (before === after) {
      drop("no change");
      continue;
    }
    if (MACHINERY.test(before) || MACHINERY.test(after)) {
      drop("not prose");
      continue;
    }
    if (isProtected(bare(before), allowlist)) {
      drop("allowlisted term");
      continue;
    }

    const hits = [];
    for (let i = 0; i < tokens.length; i += 2) {
      if (bare(tokens[i]) === before) hits.push(i);
    }
    if (hits.length === 0) {
      drop("word does not appear in the post");
      continue;
    }

    const entry = {
      before,
      after,
      reason,
      hits,
      cls: correctionClass(before, after),
      paragraph: paragraphAt[hits[0]],
      occurrences: hits.length,
    };

    if (APPLICABLE.has(entry.cls)) accepted.push(entry);
    else
      flagged.push({
        ...entry,
        why: "would change the word, not its spelling",
      });
  }

  return { accepted, rejected, flagged };
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
