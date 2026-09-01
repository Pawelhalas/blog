import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  cadenceState,
  nextBackground,
  recentBackgrounds,
} from "../lib/release-log.mjs";

/**
 * The due-date boundary is the logic with the worst history in this repo: it
 * was fixed once (363a2f4) and a wrong copy of it survived in this module,
 * unused, until #49's review. These cases pin the behaviour so the next change
 * to it is guarded rather than argued about.
 *
 * `now` is injected, which is the whole reason the function takes it.
 */

/** The real shape: an offset timestamp, as post-publish.mjs records it. */
const PUBLISHED = "2026-08-27T19:46:23+02:00";
const log = (extra = {}) => ({ published: [], misses: [], ...extra });

describe("cadenceState", () => {
  test("the due date itself is still on time", () => {
    // The rule is "at least one post every N days", so publishing on day N
    // satisfies it. Nagging on the due date and logging the miss the morning
    // after is the difference between being right and calling you late on the
    // day you shipped.
    const state = cadenceState(log(), PUBLISHED, "2026-09-10T23:59:00Z");
    assert.equal(state.dueDate, "2026-09-10");
    assert.equal(state.daysUntilDue, 0);
  });

  test("the day after the due date is a miss", () => {
    const state = cadenceState(log(), PUBLISHED, "2026-09-11T00:01:00Z");
    assert.equal(state.daysUntilDue, -1);
  });

  test("a late cron cannot move the due date", () => {
    // The regression test for the boundary bug. Measured over eight days the
    // schedule fired every time but 0.7 to 12.1 hours late, so the answer must
    // not depend on the hour the runner happened to start.
    //
    // The replaced implementation measured elapsed milliseconds and returned 1
    // at 00:10 but 0 at 23:50 — the same calendar day, two different verdicts.
    const early = cadenceState(log(), PUBLISHED, "2026-09-10T00:10:00Z");
    const late = cadenceState(log(), PUBLISHED, "2026-09-10T23:50:00Z");
    assert.equal(early.daysUntilDue, late.daysUntilDue);
    assert.equal(early.daysUntilDue, 0);
  });

  test("the nag window opens two days out", () => {
    const state = cadenceState(log(), PUBLISHED, "2026-09-08T07:17:00Z");
    assert.equal(state.daysUntilDue, 2);
  });

  test("a logged miss restarts the clock", () => {
    // Otherwise a single quiet month nags every day forever.
    const withMiss = log({ misses: [{ dueAt: "2026-09-10T17:46:23.000Z" }] });
    const state = cadenceState(withMiss, PUBLISHED, "2026-09-11T07:17:00Z");
    assert.equal(state.lastMiss, "2026-09-10T17:46:23.000Z");
    assert.equal(state.dueDate, "2026-09-24");
    assert.equal(state.daysUntilDue, 13);
  });

  test("cadenceDays in the log overrides the default", () => {
    const state = cadenceState(
      log({ cadenceDays: 3 }),
      PUBLISHED,
      "2026-09-01T07:17:00Z"
    );
    assert.equal(state.cadenceDays, 3);
    assert.equal(state.dueDate, "2026-08-30");
    assert.equal(state.daysUntilDue, -2);
  });

  test("days since the last publish counts calendar days too", () => {
    const state = cadenceState(log(), PUBLISHED, "2026-09-01T07:17:00Z");
    assert.equal(state.daysSinceLastPublish, 5);
  });

  test("no anchor at all returns null", () => {
    assert.equal(cadenceState(log(), null, "2026-09-01T07:17:00Z"), null);
  });

  test("accepts a Date as well as an ISO string", () => {
    const asDate = cadenceState(
      log(),
      PUBLISHED,
      new Date("2026-09-10T12:00:00Z")
    );
    const asString = cadenceState(log(), PUBLISHED, "2026-09-10T12:00:00Z");
    assert.deepEqual(asDate, asString);
  });
});

describe("background rotation", () => {
  const published = colours => ({
    published: colours.map(imageBackground => ({ imageBackground })),
    misses: [],
  });

  test("reports the previous two, newest first", () => {
    const state = published(["pale green", "pale violet", "pale blue"]);
    assert.deepEqual(recentBackgrounds(state), ["pale blue", "pale violet"]);
  });

  test("never repeats either of the previous two", () => {
    const state = published(["pale green", "pale violet", "pale blue"]);
    const next = nextBackground(state);
    assert.ok(!["pale blue", "pale violet"].includes(next));
    assert.equal(next, "pale green");
  });

  test("ignores entries with no recorded background", () => {
    // Posts published by hand before the pipeline existed have none.
    const state = published(["pale green", null, "pale violet"]);
    assert.deepEqual(recentBackgrounds(state), ["pale violet", "pale green"]);
  });

  test("an empty log still yields a colour", () => {
    assert.equal(nextBackground({ published: [], misses: [] }), "pale green");
  });
});
