import { readFileSync } from "node:fs";

/**
 * Orthography only — no rewriting, no improvements. The copy is Pawel's.
 *
 * The prompt asks for that, but a prompt is not a guarantee, so the result is
 * checked mechanically before anything is reported or applied: same paragraph
 * count, same word count, and every difference a single whole-word
 * substitution. Anything structural is discarded and reported as a failure
 * instead of being applied.
 *
 * Both texts are tokenised with the separators kept, so a correction can be
 * spliced back into the original without touching a single byte of whitespace.
 * That matters more than it sounds: the posts are hard-wrapped, and rebuilding
 * paragraphs from a word list would reflow every line and bury three real
 * findings in a diff of four hundred.
 */

/** `["word", " ", "word", "\n\n", "word"]` — words at even indices. */
const tokenise = text => text.split(/(\s+)/);

const isParagraphBreak = separator => /\n[ \t]*\n/.test(separator);

/** Trailing/leading punctuation is not part of the word for allowlist purposes. */
const bare = word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Tokens that look like machinery rather than prose. A "correction" to any of
 * these is a bug, not a fix — the guard drops them before they reach the PR.
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

const discard = reason => ({
  ok: false,
  reason,
  findings: [],
  rejected: [],
  applied: null,
});

export function guard(original, corrected, allowlist = new Set()) {
  const a = tokenise(original);
  const b = tokenise(corrected);

  if (a.length !== b.length) {
    return discard(`token count changed (${a.length} → ${b.length})`);
  }

  const paragraphsA = a.filter(
    (t, i) => i % 2 === 1 && isParagraphBreak(t)
  ).length;
  const paragraphsB = b.filter(
    (t, i) => i % 2 === 1 && isParagraphBreak(t)
  ).length;
  if (paragraphsA !== paragraphsB) {
    return discard(
      `paragraph count changed (${paragraphsA + 1} → ${paragraphsB + 1})`
    );
  }

  const findings = [];
  const rejected = [];
  const applied = [...a];
  let paragraph = 1;

  for (let i = 0; i < a.length; i++) {
    if (i % 2 === 1) {
      // A separator. Reflowing a hard-wrapped line is harmless and the applied
      // text keeps the original spacing regardless, so only a change in
      // paragraph structure counts as a rewrite.
      if (isParagraphBreak(a[i]) !== isParagraphBreak(b[i])) {
        return discard(
          `a paragraph was split or joined after word ${(i + 1) / 2}`
        );
      }
      if (isParagraphBreak(a[i])) paragraph++;
      continue;
    }

    if (a[i] === b[i]) continue;
    const finding = { paragraph, before: a[i], after: b[i] };

    if (MACHINERY.test(a[i]) || MACHINERY.test(b[i])) {
      rejected.push({ ...finding, why: "not prose" });
    } else if (allowlist.has(bare(a[i]))) {
      rejected.push({ ...finding, why: "allowlisted term" });
    } else {
      findings.push(finding);
      applied[i] = b[i];
    }
  }

  return { ok: true, findings, rejected, applied: applied.join("") };
}
