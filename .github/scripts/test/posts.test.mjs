import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assertNoTyporaEscape,
  buildFrontmatter,
  isPublishedPost,
  splitFrontmatter,
  stripFeatured,
} from "../lib/posts.mjs";

describe("isPublishedPost", () => {
  // This function is the entire publish signal: a draft is a path it returns
  // false for. It mirrors the collection glob in src/content.config.ts, and the
  // two must not drift.
  test("an un-prefixed markdown post is published", () => {
    assert.equal(isPublishedPost("src/content/posts/my-post.md"), true);
    assert.equal(isPublishedPost("src/content/posts/my-post.mdx"), true);
  });

  test("a leading underscore on any segment excludes the file", () => {
    assert.equal(isPublishedPost("src/content/posts/_draft.md"), false);
    assert.equal(isPublishedPost("src/content/posts/_releases/post.md"), false);
  });

  test("a nested un-prefixed post is still published", () => {
    assert.equal(isPublishedPost("src/content/posts/2026/post.md"), true);
  });

  test("anything outside the posts directory is not a post", () => {
    assert.equal(isPublishedPost("src/assets/images/x.md"), false);
    assert.equal(isPublishedPost("README.md"), false);
  });

  test("non-markdown files are not posts", () => {
    assert.equal(isPublishedPost("src/content/posts/notes.txt"), false);
  });
});

describe("splitFrontmatter", () => {
  test("parses frontmatter and returns the body untouched", () => {
    const { data, body } = splitFrontmatter("---\ntitle: X\n---\nbody here\n");
    assert.equal(data.title, "X");
    assert.equal(body, "body here\n");
  });

  test("handles CRLF line endings", () => {
    // Typora on Windows, and anything that has been through a Windows editor.
    const { data, body } = splitFrontmatter("---\r\ntitle: X\r\n---\r\nbody\n");
    assert.equal(data.title, "X");
    assert.equal(body, "body\n");
  });

  test("a file with no frontmatter yields null data and the whole text", () => {
    const text = "just a body, no frontmatter\n";
    const { data, body } = splitFrontmatter(text);
    assert.equal(data, null);
    assert.equal(body, text);
  });
});

describe("buildFrontmatter", () => {
  const built = (extra = {}) =>
    buildFrontmatter({
      title: "Tytuł posta",
      description: "Krótki opis.",
      pubDatetime: "2026-09-10T12:00:00Z",
      tags: ["ai", "projekty"],
      featured: true,
      ...extra,
    });

  test("emits pubDatetime raw, neither quoted nor reformatted", () => {
    // A YAML serialiser rewriting this into something z.date() rejects fails
    // astro check, which fails the build, which fails the Cloudflare deploy.
    assert.match(built(), /^pubDatetime: 2026-09-10T12:00:00Z$/m);
  });

  test("round-trips a title containing a colon", () => {
    const { data } = splitFrontmatter(built({ title: "AI: co dalej" }));
    assert.equal(data.title, "AI: co dalej");
  });

  test("never folds a long description onto a second line", () => {
    const description = "A".repeat(155);
    const text = built({ description });
    assert.ok(text.includes(`description: ${description}\n`));
  });

  test("omits featured entirely when it is false", () => {
    assert.ok(!built({ featured: false }).includes("featured"));
  });

  test("round-trips tags", () => {
    const { data } = splitFrontmatter(built());
    assert.deepEqual(data.tags, ["ai", "projekty"]);
  });
});

describe("stripFeatured", () => {
  test("removes the featured line and leaves every other byte alone", () => {
    // The other post is already published, so the goal is the smallest possible
    // diff — comments and spacing in its frontmatter must survive.
    const text =
      "---\ntitle: Stary post\n# a comment\nfeatured: true\ntags:\n  - ai\n---\nbody\n";
    const result = stripFeatured(text);
    assert.equal(result.changed, true);
    assert.ok(!result.text.includes("featured"));
    assert.ok(result.text.includes("# a comment"));
    assert.ok(result.text.includes("  - ai"));
    assert.ok(result.text.endsWith("---\nbody\n"));
  });

  test("reports no change when there is no featured line", () => {
    const text = "---\ntitle: Stary post\n---\nbody\n";
    const result = stripFeatured(text);
    assert.equal(result.changed, false);
    assert.equal(result.text, text);
  });

  test("a file with no frontmatter is returned unchanged", () => {
    const result = stripFeatured("no frontmatter here\n");
    assert.equal(result.changed, false);
    assert.equal(result.text, "no frontmatter here\n");
  });
});

describe("assertNoTyporaEscape", () => {
  test("throws on Typora's escaped delimiters", () => {
    // Typora writes \--- instead of ---, which fails YAML parsing and takes the
    // whole build down. Caught here it is a legible workflow failure instead.
    assert.throws(
      () => assertNoTyporaEscape("\\---\ntitle: X\n\\---\nbody\n", "post.md"),
      /Typora quirk/
    );
  });

  test("accepts normal delimiters", () => {
    assert.doesNotThrow(() =>
      assertNoTyporaEscape("---\ntitle: X\n---\nbody\n", "post.md")
    );
  });
});
