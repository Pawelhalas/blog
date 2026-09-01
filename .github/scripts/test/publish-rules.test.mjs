import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addedPost,
  disallowedPaths,
  shouldMerge,
} from "../lib/publish-rules.mjs";

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
  requiredChecks: ["Code standards & build", "Automation tests"],
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

  test("REGRESSION: the pipeline's own commit cannot un-hold a pull request", () => {
    // What actually went wrong in rehearsal. [hold] used to be read from the
    // branch's last commit subject, and release.mjs always commits "Prepare
    // <slug> for publishing" on top of what the author pushed — so the marker
    // was never the last subject and a post that had asked to be held published
    // itself anyway.
    //
    // The marker now sets the `hold` label at prepare time, and only the label
    // is consulted. Nothing about later commits can lift it.
    const result = shouldMerge(
      ready({
        labels: ["automated-release", "hold"],
        checks: GREEN,
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, false);
    assert.match(result.reason, /hold/);
  });

  test("a pending non-required check does not gate the merge", () => {
    // Cloudflare's preview deployment can sit pending for a long time and is
    // not a required context. Naming the required checks is what keeps it from
    // either blocking forever or, as in rehearsal, silently not counting.
    const result = shouldMerge(
      ready({
        checks: [...GREEN, { name: "Cloudflare Pages", conclusion: null }],
      })
    );
    assert.equal(result.merge, true);
  });

  test("a required check missing from the rollup is a refusal, not a pass", () => {
    const result = shouldMerge(
      ready({
        checks: [{ name: "Code standards & build", conclusion: "SUCCESS" }],
      })
    );
    assert.equal(result.merge, false);
    assert.match(result.reason, /waiting on: Automation tests/);
  });

  test("a check awaiting manual approval escalates, never waits", () => {
    // The stall rehearsal found. When the pipeline pushed its prepared commit
    // to a pull request that already existed, the resulting CI run landed in
    // action_required and never ran. Treating that as "still running" would
    // have waited for ever, silently, on a check nobody knew needed a click.
    const result = shouldMerge(
      ready({
        checks: [
          { name: "Code standards & build", conclusion: "ACTION_REQUIRED" },
          { name: "Automation tests", conclusion: "SUCCESS" },
        ],
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
    assert.match(result.reason, /action required/);
  });

  test("a cancelled or timed-out check escalates too", () => {
    for (const conclusion of ["CANCELLED", "TIMED_OUT", "STARTUP_FAILURE"]) {
      const result = shouldMerge(
        ready({
          checks: [
            { name: "Code standards & build", conclusion },
            { name: "Automation tests", conclusion: "SUCCESS" },
          ],
        })
      );
      assert.equal(result.merge, false, conclusion);
      assert.equal(result.blocking, true, conclusion);
    }
  });

  test("a failing required check blocks even when others passed", () => {
    const result = shouldMerge(
      ready({
        checks: [
          { name: "Code standards & build", conclusion: "SUCCESS" },
          { name: "Automation tests", conclusion: "FAILURE" },
        ],
      })
    );
    assert.equal(result.merge, false);
    assert.equal(result.blocking, true);
    assert.match(result.reason, /Automation tests/);
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
        checks: [
          { name: "Code standards & build", conclusion: null },
          { name: "Automation tests", conclusion: null },
        ],
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

describe("addedPost", () => {
  // The bug this exists for: a release always MODIFIES the previously featured
  // post to strip its `featured` flag, so a release pull request always touches
  // two markdown files. Code that assumed one could not find the schedule, and
  // a post scheduled four days out published itself within the minute.
  const files = [
    { path: "src/content/posts/new-post.md", changeType: "ADDED" },
    { path: "src/content/posts/older-post.md", changeType: "MODIFIED" },
    { path: "src/assets/images/new-post-green.png", changeType: "ADDED" },
  ];

  test("picks the added post, not merely the only one", () => {
    const found = addedPost(files);
    assert.equal(found.length, 1);
    assert.equal(found[0].path, "src/content/posts/new-post.md");
  });

  test("ignores an added image", () => {
    assert.ok(!addedPost(files).some(f => f.path.endsWith(".png")));
  });

  test("two added posts is not one, so the caller can refuse", () => {
    const two = [
      { path: "src/content/posts/a.md", changeType: "ADDED" },
      { path: "src/content/posts/b.md", changeType: "ADDED" },
    ];
    assert.equal(addedPost(two).length, 2);
  });

  test("a release that adds no post yields nothing", () => {
    const none = [
      { path: "src/content/posts/older-post.md", changeType: "MODIFIED" },
    ];
    assert.equal(addedPost(none).length, 0);
  });
});
