import { IN_CI } from "./git.mjs";

/**
 * One place that decides whether a script may change anything.
 *
 * The rule: **a dry run that writes is not a dry run.** `DRY_RUN` has to gate
 * every side effect — the log write, the commit, the push — not only the
 * notification. It did not, and that fabricated a missed deadline on `main`
 * on 2026-09-01: a local run with `DRY_RUN=true WRITE_ENABLED=true` committed
 * and pushed, taking an unmerged pull request with it.
 *
 * `release.mjs` had this right from the start — its `DRY_RUN` returns before
 * anything is written. The two workflows that write the release log did not.
 * Same repository, two different meanings for the same flag, which is how it
 * caught the same person twice.
 *
 * Three conditions, because they fail differently:
 *
 *   WRITE_ENABLED  per-workflow configuration. Off means "observe only".
 *   DRY_RUN        per-run intent. On means "tell me, don't do it".
 *   IN_CI          where this is running. A laptop computes and prints;
 *                  pushing to a real branch is something CI does.
 *
 * The third is the backstop the other two cannot provide: omitting `DRY_RUN`
 * entirely satisfies the first two, and that is exactly how a local run reaches
 * a `git push` by accident.
 */
export function writeMode({ writeEnabled, dryRun }) {
  const blockedBy = !writeEnabled
    ? "WRITE_ENABLED is off"
    : dryRun
      ? "DRY_RUN is on"
      : !IN_CI
        ? "not running in GitHub Actions"
        : null;

  return {
    may: blockedBy === null,
    blockedBy,
    /**
     * Printed as the first line of every run. The trap was only discoverable by
     * being burned by it; this makes the answer visible before anything happens.
     */
    banner:
      `mode: WRITE_ENABLED=${writeEnabled} DRY_RUN=${dryRun} IN_CI=${IN_CI} → ` +
      (blockedBy === null ? "writes ENABLED" : `writes BLOCKED (${blockedBy})`),
  };
}

/**
 * Whether a script may open, close or comment on a GitHub issue.
 *
 * Opening an issue is a side effect too, and it was gated on `DRY_RUN` alone —
 * the same hole `writeMode` was built to close, one door along. That is how
 * issue #47 came to exist: a local run with `DRY_RUN` unset emailed Pawel about
 * a missed deadline that never happened, and the issue outlived the revert of
 * the commit it was describing.
 *
 * `WRITE_ENABLED` deliberately does **not** gate this, which is the one place
 * notifications differ from writes. Observation mode is supposed to nag: the
 * cadence check ran for its first weeks with `WRITE_ENABLED=false` precisely so
 * it would notify without touching the log, and that was the point of it.
 *
 * So: per-run intent still silences it, and CI is still the only place allowed
 * to act on the outside world.
 */
export function notifyMode({ dryRun }) {
  const blockedBy = dryRun
    ? "DRY_RUN is on"
    : !IN_CI
      ? "not running in GitHub Actions"
      : null;

  return {
    may: blockedBy === null,
    blockedBy,
    banner:
      `issues: DRY_RUN=${dryRun} IN_CI=${IN_CI} → ` +
      (blockedBy === null
        ? "issue changes ENABLED"
        : `issue changes BLOCKED (${blockedBy})`),
  };
}
