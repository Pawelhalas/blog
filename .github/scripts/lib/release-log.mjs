import { readFileSync, writeFileSync } from "node:fs";

/**
 * Cadence state is split by nature.
 *
 * *Last published* is derived from git (`lib/git.mjs`) — there is nothing to
 * store and nothing to corrupt. *Misses* are not derivable from anything, so
 * they live here. This file must be on `main`: scheduled workflows only ever
 * run from the default branch.
 *
 * It cannot live in `docs/` — that directory is gitignored in this repo and is
 * its own private git repo, so a workflow running in `Pawelhalas/blog` cannot
 * see it.
 */
export const LOG_PATH = ".github/release-log.json";

export const CADENCE_DAYS = 14;
export const NAG_LEAD_DAYS = 2;

/** Rotates and never repeats the previous two (see the image style template). */
export const BACKGROUNDS = [
  "pale green",
  "pale violet",
  "pale blue",
  "pale peach",
  "pale grey-blue",
  "pale terracotta",
  "pale yellow",
  "pale pink",
];

export function readLog(path = LOG_PATH) {
  const log = JSON.parse(readFileSync(path, "utf8"));
  log.published ??= [];
  log.misses ??= [];
  return log;
}

export function writeLog(log, path = LOG_PATH) {
  writeFileSync(path, `${JSON.stringify(log, null, 2)}\n`);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(iso, days) {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/**
 * UTC calendar day number.
 *
 * The boundary rule for the whole cadence, and it must stay calendar-based. The
 * cron is reliable in occurrence and unreliable in timing — measured 0.7 to 12.1
 * hours late — so a difference measured in elapsed hours makes the due date move
 * depending on when the runner happened to start. Counting whole UTC days gives
 * the same answer at 00:10 and at 23:50 on the same date.
 */
export const utcDay = value => Math.floor(Date.parse(value) / DAY_MS);

/**
 * Everything the cadence check needs to decide what to do today.
 *
 * The clock restarts on a publish *and* on a logged miss — otherwise a single
 * quiet month would nag every day forever. "Miss logged once, clock reset once,
 * notifications stop until the next due window."
 *
 * `now` is a parameter rather than a `new Date()` inside, which is what makes
 * every boundary case testable without waiting for the date to arrive.
 *
 * This function used to exist, be exported, and be called by nothing, while
 * `cadence.mjs` computed the same thing inline — and the two had drifted apart:
 * this one measured `daysUntilDue` with `Math.ceil` over raw milliseconds, the
 * semantics replaced in 363a2f4 precisely because they round the due date
 * sideways when the cron runs late. A plausible, well-named helper carrying a
 * fixed bug is worse than no helper, so it is now the only implementation.
 */
export function cadenceState(log, lastPublishedAt, now = new Date()) {
  const lastMiss = log.misses.at(-1)?.dueAt ?? null;
  const anchors = [lastPublishedAt, lastMiss].filter(Boolean);
  if (anchors.length === 0) return null;

  const nowIso = now instanceof Date ? now.toISOString() : now;
  const cadenceDays = log.cadenceDays ?? CADENCE_DAYS;
  const startedAt = anchors.reduce((a, b) =>
    Date.parse(a) > Date.parse(b) ? a : b
  );
  const dueAt = addDays(startedAt, cadenceDays);

  return {
    startedAt,
    dueAt,
    dueDate: dueAt.slice(0, 10),
    // Note the boundary: the due date itself is still on time, so this is 0 on
    // the day something must ship and negative only once that day has passed.
    daysUntilDue: utcDay(dueAt) - utcDay(nowIso),
    daysSinceLastPublish: lastPublishedAt
      ? utcDay(nowIso) - utcDay(lastPublishedAt)
      : null,
    cadenceDays,
    lastPublishedAt,
    lastMiss,
  };
}

/** The two most recent background colours, newest first. */
export function recentBackgrounds(log) {
  return log.published
    .map(entry => entry.imageBackground)
    .filter(Boolean)
    .slice(-2)
    .reverse();
}

export function nextBackground(log) {
  const recent = new Set(recentBackgrounds(log));
  return BACKGROUNDS.find(colour => !recent.has(colour)) ?? BACKGROUNDS[0];
}
