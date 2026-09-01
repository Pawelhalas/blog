import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { applyCorrections, verifyCorrections } from "../lib/orthography.mjs";

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
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].after, "airport");
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

  test("KNOWN GAP: a word-split correction is unreachable", () => {
    // Open item #10. `napewno -> na pewno` is a real Polish orthography error
    // and the guard drops it, because "one whole word in, one whole word out"
    // is what makes rewriting unrepresentable.
    //
    // This test documents current behaviour deliberately. The safe fix is to
    // allow a space in `after` only when the letters are otherwise identical —
    // when that lands, change this test on purpose rather than discovering it.
    const result = only("To jest napewno dobre.", "napewno", "na pewno");
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].why, "not a single word");
  });
});

describe("applyCorrections", () => {
  test("a dollar sign in the correction is inserted literally", () => {
    // String.replace reads $& and $1 in the replacement as patterns, so a
    // correction containing one would splice the matched text back in. The
    // function form of replace is what stops that.
    const { accepted } = only("cena wynosi 100.", "cena", "$&x");
    assert.equal(accepted.length, 1);
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
