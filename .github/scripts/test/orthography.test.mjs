import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  applyCorrections,
  correctionClass,
  verifyCorrections,
} from "../lib/orthography.mjs";

/**
 * The guard between a language model and Pawel's published prose.
 *
 * Every rejection reason below is a bug that actually shipped or was caught
 * one review away from shipping, so each case is a regression test rather than
 * a hypothetical.
 */

const only = (text, before, after, allowlist = new Set()) =>
  verifyCorrections(text, [{ before, after, reason: "test" }], allowlist);

describe("verifyCorrections", () => {
  test("an allowlisted term is protected in its inflected forms", () => {
    // Polish inflects proper nouns, so exact matching was not enough: the
    // allowlist said Anthropic and the text said Anthropica. A first pass
    // accepted "Anthropica -> Antropika" across five occurrences of a company
    // name and called it a spelling fix.
    const result = only(
      "Anthropica zbudowała ten model.",
      "Anthropica",
      "Antropika",
      new Set(["Anthropic"])
    );
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].why, "allowlisted term");
  });

  test("a short allowlist entry does not shield unrelated words", () => {
    // The prefix rule is guarded at four characters, or an entry like AI would
    // protect every word starting with those letters.
    const result = only(
      "Poszedłem na aiport.",
      "aiport",
      "airport",
      new Set(["AI"])
    );
    // It reaches classification instead of being shielded, which is the point.
    // (Adding a letter is a rewording risk, so it lands in `flagged` rather
    // than `accepted` — see correctionClass below.)
    assert.equal(result.rejected.length, 0);
    assert.equal(result.flagged.length, 1);
    assert.equal(result.flagged[0].after, "airport");
  });

  test("a correction for a word that is not in the post is dropped", () => {
    // The anti-hallucination guard, and the one that matters most: a fix to a
    // word the post does not contain has nothing to match, so it cannot apply.
    const result = only(
      "Zwykły tekst bez błędów.",
      "nieistniejace",
      "nieistniejące"
    );
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].why, "word does not appear in the post");
  });

  test("markup is never treated as prose", () => {
    const url = only(
      "Zobacz https://example.com/foo tutaj.",
      "https://example.com/foo",
      "https://example.com/bar"
    );
    assert.equal(url.rejected[0].why, "not prose");

    const path = only(
      "Plik ./src/index.ts jest tutaj.",
      "./src/index.ts",
      "./src/index.js"
    );
    assert.equal(path.rejected[0].why, "not prose");
  });

  test("a no-op correction is dropped", () => {
    const result = only("Tekst jest dobry.", "dobry", "dobry");
    assert.equal(result.rejected[0].why, "no change");
  });

  test("occurrences and paragraph number are reported", () => {
    const text = "Pierwszy blad tutaj.\n\nDrugi akapit ma blad znowu.";
    const result = only(text, "blad", "błąd");
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].occurrences, 2);
    assert.equal(result.accepted[0].paragraph, 1);
  });

  test("punctuation around a word is not part of the word", () => {
    const result = only("To jest blad.", "blad", "błąd");
    assert.equal(result.accepted.length, 1);
  });

  test("a word split is applied - open item #10, now closed", () => {
    // This test used to assert the opposite, and its own comment named the fix:
    // allow a space in `after` only when the letters are otherwise identical.
    // That is what correctionClass does, so this is now a correction the
    // pipeline makes on its own.
    const result = only("To jest napewno dobre.", "napewno", "na pewno");
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].cls, "split");
  });

  test("a space in `after` that is NOT a split is still refused", () => {
    // The split rule must not become a hole a phrase can arrive through.
    const result = only("To jest dobre.", "dobre", "bardzo dobre");
    assert.equal(result.accepted.length, 0);
    assert.equal(result.flagged.length, 1);
  });

  test("`before` must still be a single word", () => {
    const result = only(
      "To jest napewno dobre.",
      "jest napewno",
      "jest na pewno"
    );
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].why, "not a single word");
  });

  test("swapping one real word for another is reported, never applied", () => {
    // The guarantee the whole autonomous flow rests on. `morze` and `moze` are
    // both real Polish words; choosing between them is a judgement about what
    // Pawel meant, and it is not the automation's to make.
    const result = only("Patrzy na morze codziennie.", "morze", "moze");
    assert.equal(result.accepted.length, 0);
    assert.equal(result.flagged.length, 1);
    assert.equal(result.flagged[0].cls, "other");
    assert.match(result.flagged[0].why, /change the word, not its spelling/);
  });
});

describe("applyCorrections", () => {
  test("a dollar sign in the correction is inserted literally", () => {
    // String.replace reads $& and $1 in the replacement as patterns, so a
    // correction containing one would splice the matched text back in. The
    // function form of replace is what stops that.
    // Built by hand: no correction the classifier now accepts could contain a
    // `$`, but applyCorrections is general and this guard must not rot.
    const accepted = [{ before: "cena", after: "$&x", hits: [0] }];
    assert.equal(
      applyCorrections("cena wynosi 100.", accepted),
      "$&x wynosi 100."
    );
  });

  test("every byte around the correction survives", () => {
    // Rebuilt from the token list, so a three-word fix stays a three-word diff
    // instead of reflowing the post: double spaces, trailing spaces and line
    // wrapping all have to come back unchanged.
    const text = "pierwszy  blad   tutaj  \nnastępna linia\n";
    const { accepted } = only(text, "blad", "błąd");
    assert.equal(
      applyCorrections(text, accepted),
      "pierwszy  błąd   tutaj  \nnastępna linia\n"
    );
  });

  test("applies every occurrence of an accepted correction", () => {
    const text = "blad i jeszcze raz blad.";
    const { accepted } = only(text, "blad", "błąd");
    assert.equal(applyCorrections(text, accepted), "błąd i jeszcze raz błąd.");
  });

  test("no accepted corrections leaves the text identical", () => {
    const text = "Tekst bez zmian.\n";
    assert.equal(applyCorrections(text, []), text);
  });
});

describe("correctionClass", () => {
  // The classifier IS the promise that the automation cannot reword the post.
  // If it is wrong nothing downstream catches it, because nothing downstream
  // looks at the words again.

  test("a missing diacritic is a spelling fix", () => {
    assert.equal(correctionClass("zgineło", "zginęło"), "diacritics");
    assert.equal(correctionClass("moglbym", "mógłbym"), "diacritics");
  });

  test("Polish ł is folded explicitly, because NFD leaves it alone", () => {
    // ę decomposes and loses its ogonek under NFD; ł does not decompose at all.
    // Without the explicit fold, bylem -> byłem looks like a different word and
    // one of the commonest Polish typos could never be fixed.
    assert.equal(correctionClass("bylem", "byłem"), "diacritics");
    assert.equal(correctionClass("Lodz", "Łódź"), "diacritics");
  });

  test("a word split keeps the same letters", () => {
    assert.equal(correctionClass("napewno", "na pewno"), "split");
    assert.equal(correctionClass("wogóle", "w ogóle"), "split");
  });

  test("capitalisation alone is a case fix", () => {
    assert.equal(correctionClass("polska", "Polska"), "case");
  });

  test("changing which word it is classifies as other", () => {
    assert.equal(correctionClass("morze", "może"), "other");
    assert.equal(correctionClass("bardzo", "barzdo"), "other");
    assert.equal(correctionClass("dobre", "bardzo dobre"), "other");
  });

  test("adding or removing a letter classifies as other", () => {
    // The accepted cost of safe-classes-only: a genuine typo, reported rather
    // than fixed. Reporting a real error is a smaller failure than silently
    // replacing a word the author chose.
    assert.equal(correctionClass("widzalem", "widziałem"), "other");
  });
});
