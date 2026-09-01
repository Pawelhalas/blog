import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { disallowedPaths, shouldMerge } from "../lib/publish-rules.mjs";

/**
 * These gates are the whole of what used to be Pawel reading a pull request and
 * deciding. Nobody reviews a release again once this is running, so every gate
 * gets a test, including the ones that look obvious.
 */

const GREEN = [
  { name: "Code standards & build", conclusion: "SUCCESS" },
  { name: "Automation tests", conclusion: "SUCCESS" },
];

/** A release that should sail through, so each test can spoil exactly one thing. */
const ready = (overrides = {}) => ({
  checks: GREEN,
  pubDatetime: null,
  openedAt: "2026-09-10T09:00:00Z",
  labels: ["automated-release"],
  lastCommitSubject: "Prepare my-post for publishing",
  changedPaths: [
    "src/content/posts/my-post.md",
    "src/assets/images/my-post-blue.png",
  ],
  mergeable: true,
  holdMinutes: 60,
  now: "2026-09-10T11:00:00Z",
  ...overrides,
});

describe("shouldMerge", () => {
  test("publishes when every gate is clear", () => {
    const { merge, blocking } = shouldMerge(ready());
    assert.equal(merge, true);
    assert.equal(blocking, false);
  });

  test("refuses and escalates a pull request touching anything but posts and images", () => {
    // The security gate. An unattended merge bot that can land changes to
    // .github/ can rewrite the rules it runs under, on a public repo where
    // anyone may open a pull request.
    const result = shouldMerge(
      ready({
        changedPaths: [
          "src/content/posts/my-post.md",
          ".github/workflows/publish.yml",
        ],
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
    assert.match(result.reason, /outside posts and images/);
  });

  test("refuses a pull request that changes nothing", () => {
    const result = shouldMerge(ready({ changedPaths: [] }));
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
  });

  test("the hold label stops it, without raising an alarm", () => {
    const result = shouldMerge(
      ready({ labels: ["automated-release", "hold"] })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
    assert.match(result.reason, /hold/);
  });

  test("[hold] in the last commit subject stops it", () => {
    const result = shouldMerge(
      ready({
        lastCommitSubject: "Prepare my-post [hold] until I check the data",
      })
    );
    assert.equal(result.merge, false);
    assert.match(result.reason, /\[hold\]/);
  });

  test("[hold] in the commit BODY does not stop it", () => {
    // Same rule as [reimage] and [remeta]: the subject line is where an
    // instruction belongs, the body is where you write about one. Matching the
    // whole message fired a marker from a commit that merely explained it.
    const result = shouldMerge(
      ready({
        lastCommitSubject:
          "Prepare my-post for publishing\n\nUse [hold] to stop this publishing.",
      })
    );
    assert.equal(result.merge, true);
  });

  test("a failing check blocks and escalates", () => {
    const result = shouldMerge(
      ready({
        checks: [
          { name: "Code standards & build", conclusion: "FAILURE" },
          { name: "Automation tests", conclusion: "SUCCESS" },
        ],
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
    assert.match(result.reason, /Code standards & build/);
  });

  test("checks still running are a wait, not an alarm", () => {
    const result = shouldMerge(
      ready({
        checks: [{ name: "Code standards & build", conclusion: null }],
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
  });

  test("no checks at all is a wait", () => {
    const result = shouldMerge(ready({ checks: [] }));
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
  });

  test("conflicts with main block and escalate", () => {
    const result = shouldMerge(ready({ mergeable: false }));
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
  });

  test("a future pubDatetime waits — this is the queue", () => {
    const result = shouldMerge(
      ready({
        pubDatetime: "2026-09-20T09:00:00Z",
        now: "2026-09-10T11:00:00Z",
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
    assert.match(result.reason, /scheduled for 2026-09-20/);
  });

  test("a pubDatetime that has arrived publishes", () => {
    const result = shouldMerge(
      ready({
        pubDatetime: "2026-09-10T09:00:00Z",
        now: "2026-09-10T11:00:00Z",
      })
    );
    assert.equal(result.merge, true);
  });

  test("an unparseable pubDatetime blocks and escalates", () => {
    const result = shouldMerge(ready({ pubDatetime: "next Tuesday" }));
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
  });

  test("the hold window holds, and reports how much is left", () => {
    const result = shouldMerge(
      ready({
        openedAt: "2026-09-10T09:00:00Z",
        now: "2026-09-10T09:15:00Z",
        holdMinutes: 60,
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
    assert.match(result.reason, /45 min left/);
  });

  test("the hold window is measured from when the pull request opened", () => {
    const result = shouldMerge(
      ready({
        openedAt: "2026-09-10T09:00:00Z",
        now: "2026-09-10T10:00:00Z",
        holdMinutes: 60,
      })
    );
    assert.equal(result.merge, true);
  });

  test("a zero hold window publishes as soon as the checks are green", () => {
    const result = shouldMerge(
      ready({
        openedAt: "2026-09-10T09:00:00Z",
        now: "2026-09-10T09:00:30Z",
        holdMinutes: 0,
      })
    );
    assert.equal(result.merge, true);
  });

  test("the path gate is checked before the hold gate", () => {
    // Order matters for the message: a stray path is what a human must see,
    // and it must not be hidden behind "not yet due".
    const result = shouldMerge(
      ready({
        changedPaths: ["package.json"],
        now: "2026-09-10T09:00:30Z",
      })
    );
    assert.match(result.reason, /outside posts and images/);
  });
});

describe("disallowedPaths", () => {
  test("accepts posts and images", () => {
    assert.deepEqual(
      disallowedPaths([
        "src/content/posts/a.md",
        "src/content/posts/nested/b.md",
        "src/assets/images/a-blue.png",
      ]),
      []
    );
  });

  test("names everything else", () => {
    assert.deepEqual(
      disallowedPaths([
        "src/content/posts/a.md",
        ".github/workflows/publish.yml",
        "package.json",
        "src/pages/index.astro",
      ]),
      [".github/workflows/publish.yml", "package.json", "src/pages/index.astro"]
    );
  });

  test("a lookalike prefix does not slip through", () => {
    assert.deepEqual(
      disallowedPaths([
        "src/content/posts-evil/a.md",
        "src/assets/imagesx/b.png",
      ]),
      ["src/content/posts-evil/a.md", "src/assets/imagesx/b.png"]
    );
  });
});
