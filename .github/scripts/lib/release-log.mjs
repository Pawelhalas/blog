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
 * The clock restarts on a publish *and* on a logged miss — otherwise a single
 * quiet month would nag every day forever. "Miss logged once, clock reset once,
 * notifications stop until the next due window."
 */
export function cadenceState(log, lastPublishedAt, now = new Date()) {
  const lastMiss = log.misses.at(-1)?.dueAt ?? null;
  const anchors = [lastPublishedAt, lastMiss].filter(Boolean);
  if (anchors.length === 0) return null;

  const startedAt = anchors.reduce((a, b) =>
    Date.parse(a) > Date.parse(b) ? a : b
  );
  const dueAt = addDays(startedAt, log.cadenceDays ?? CADENCE_DAYS);
  const daysUntilDue = Math.ceil((Date.parse(dueAt) - now.getTime()) / DAY_MS);

  return { startedAt, dueAt, daysUntilDue, lastPublishedAt, lastMiss };
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
