import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  heroImageMarkdown,
  pipelineHero,
  replaceHeroImage,
  withHeroImage,
} from "../lib/posts.mjs";
import { BACKGROUNDS } from "../lib/release-log.mjs";

const slug = "my-post";
const hero = heroImageMarkdown("A lighthouse at dusk", "my-post-peach.png");
const photo = "![My desk](../../assets/images/my-desk.jpg)";

describe("pipelineHero", () => {
  // [reimage] replaces whatever this returns and overwrites its file. A false
  // positive destroys an author's photo, so every miss below is deliberate.
  test("finds the hero this pipeline prepended", () => {
    const body = withHeroImage("Some prose.\n", hero);
    assert.deepEqual(pipelineHero(body, slug, BACKGROUNDS), {
      alt: "A lighthouse at dusk",
      file: "my-post-peach.png",
      markdown: hero,
    });
  });

  test("recognises every background colour, including grey-blue", () => {
    for (const colour of BACKGROUNDS) {
      const file = `${slug}-${colour.split(" ").at(-1)}.png`;
      const body = withHeroImage("x", heroImageMarkdown("alt", file));
      assert.equal(pipelineHero(body, slug, BACKGROUNDS)?.file, file);
    }
  });

  test("ignores an author's photo that is not first in the body", () => {
    // The bug: the old regex matched the first local image anywhere.
    const body = `Intro paragraph.\n\n${photo}\n\nMore prose.\n`;
    assert.equal(pipelineHero(body, slug, BACKGROUNDS), null);
  });

  test("ignores an author's photo even when it opens the body", () => {
    const body = `\n${photo}\n\nProse.\n`;
    assert.equal(pipelineHero(body, slug, BACKGROUNDS), null);
  });

  test("ignores the pipeline's filename pattern when it is not first", () => {
    const body = `Prose first.\n\n${hero}\n`;
    assert.equal(pipelineHero(body, slug, BACKGROUNDS), null);
  });

  test("ignores another post's generated hero", () => {
    const other = heroImageMarkdown("alt", "other-post-peach.png");
    assert.equal(
      pipelineHero(withHeroImage("x", other), slug, BACKGROUNDS),
      null
    );
  });

  test("ignores a slug that merely starts the same way", () => {
    const longer = heroImageMarkdown("alt", "my-post-two-peach.png");
    assert.equal(
      pipelineHero(withHeroImage("x", longer), slug, BACKGROUNDS),
      null
    );
  });

  test("ignores an unknown colour or a non-PNG", () => {
    for (const file of ["my-post-orange.png", "my-post-peach.jpg"]) {
      const body = withHeroImage("x", heroImageMarkdown("alt", file));
      assert.equal(pipelineHero(body, slug, BACKGROUNDS), null);
    }
  });

  test("ignores a body with no images", () => {
    assert.equal(pipelineHero("Just words.\n", slug, BACKGROUNDS), null);
  });
});

describe("replaceHeroImage", () => {
  test("swaps the hero and leaves the author's photo alone", () => {
    const body = withHeroImage(`Prose.\n\n${photo}\n`, hero);
    const found = pipelineHero(body, slug, BACKGROUNDS);
    const fresh = heroImageMarkdown("A new picture", "my-post-peach.png");
    const out = replaceHeroImage(body, found, fresh);
    assert.equal(out, `\n${fresh}\n\nProse.\n\n${photo}\n`);
  });

  test("treats a $ in the alt text literally", () => {
    const body = withHeroImage("Prose.\n", hero);
    const found = pipelineHero(body, slug, BACKGROUNDS);
    const fresh = heroImageMarkdown("Costs $& and $1", "my-post-peach.png");
    assert.ok(replaceHeroImage(body, found, fresh).includes("Costs $& and $1"));
  });
});
