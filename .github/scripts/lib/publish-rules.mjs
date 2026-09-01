/**
 * Whether a prepared release may merge itself.
 *
 * Every judgement Pawel used to make by reading a pull request and clicking a
 * button now lives in this function. It is deliberately pure — no `gh`, no
 * clock, no network — because it is the piece nobody will review again once it
 * is running, and the only way to trust it is to be able to test every gate.
 *
 * `publish.mjs` gathers the facts; this decides. The split exists so the
 * decision can be exercised without a repository.
 */

/**
 * A release may only ever touch prose and pictures.
 *
 * This is a security control, not tidiness. An unattended merge bot that can
 * land changes to `.github/` is a bot that can rewrite the rules it runs under,
 * on a public repository where anyone may open a pull request. Posts and images
 * are the entire legitimate surface of a release.
 */
const ALLOWED = [/^src\/content\/posts\//, /^src\/assets\/images\//];

export const disallowedPaths = paths =>
  paths.filter(path => !ALLOWED.some(allowed => allowed.test(path)));

/** Same idiom as [reimage] and [remeta]: subject line only, never the body. */
const HOLD_MARKER = /\[hold\]/i;

const MINUTE_MS = 60 * 1000;

/**
 * @returns {{merge: boolean, reason: string, blocking: boolean}}
 *   `blocking` means a human has to look — it raises an urgent issue. A merge
 *   that is merely *not yet* due is not blocking; it is the system working.
 */
export function shouldMerge({
  checks = [],
  pubDatetime,
  openedAt,
  labels = [],
  lastCommitSubject = "",
  changedPaths = [],
  mergeable = true,
  holdMinutes = 60,
  now = new Date(),
}) {
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  const no = (reason, blocking = false) => ({ merge: false, reason, blocking });

  // Checked first and hardest: everything below assumes this is an ordinary
  // post release, and this is the assertion that it is one.
  const stray = disallowedPaths(changedPaths);
  if (stray.length > 0) {
    return no(
      `touches files outside posts and images: ${stray.join(", ")}`,
      true
    );
  }
  if (changedPaths.length === 0) {
    return no("changes nothing", true);
  }

  // The kill switch, before any of the "not yet" gates, so that holding a pull
  // request reads as held rather than as pending.
  if (labels.includes("hold")) return no("held by the `hold` label");
  if (HOLD_MARKER.test(lastCommitSubject.split("\n")[0])) {
    return no("held by [hold] in the last commit subject");
  }

  if (!mergeable) return no("conflicts with main", true);

  if (checks.some(check => check.conclusion === "FAILURE")) {
    const failed = checks
      .filter(check => check.conclusion === "FAILURE")
      .map(check => check.name)
      .join(", ");
    return no(`required checks failed: ${failed}`, true);
  }
  if (checks.length === 0 || checks.some(check => !check.conclusion)) {
    return no("checks have not finished");
  }

  // The schedule. An author-written pubDatetime is an instruction about when
  // the post goes live, so a future one simply waits — that is the queue.
  if (pubDatetime) {
    const due = Date.parse(pubDatetime);
    if (Number.isNaN(due))
      return no(`unparseable pubDatetime: ${pubDatetime}`, true);
    if (at < due) return no(`scheduled for ${pubDatetime}`);
  }

  // The window that exists purely so a mistake is catchable. Nothing requires
  // Pawel to use it; it requires only that he *could*.
  const openedMs = Date.parse(openedAt);
  if (Number.isNaN(openedMs))
    return no(`unparseable PR open time: ${openedAt}`, true);
  const releaseAt = openedMs + holdMinutes * MINUTE_MS;
  if (at < releaseAt) {
    const left = Math.ceil((releaseAt - at) / MINUTE_MS);
    return no(`inside the ${holdMinutes}-minute hold window, ${left} min left`);
  }

  return { merge: true, reason: "all gates clear", blocking: false };
}
