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

/**
 * The post this release is publishing, out of everything the pull request touches.
 *
 * Not "the only markdown file": a release also *modifies* the previously
 * featured post to strip its `featured` flag, so there are always two. Assuming
 * one meant the schedule could not be found, and a post scheduled for next week
 * published itself within the minute — which is exactly what happened in
 * rehearsal. The new post is the ADDED one.
 */
export function addedPost(files) {
  return files.filter(
    file =>
      file.changeType === "ADDED" &&
      file.path.startsWith("src/content/posts/") &&
      file.path.endsWith(".md")
  );
}

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
  requiredChecks = [],
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
  //
  // The label is the whole mechanism. `[hold]` in a pushed commit is only a way
  // to *set* it at push time: release.mjs reads the marker and opens the pull
  // request already labelled. This used to be checked here, against the branch's
  // last commit, and it did not work — the pipeline always commits its own
  // "Prepare <slug> for publishing" on top, so the author's marker was never the
  // last subject. A rehearsal published a post that had asked to be held.
  if (labels.includes("hold")) return no("held by the `hold` label");

  if (!mergeable) return no("conflicts with main", true);

  // Only the checks branch protection actually requires, named explicitly.
  //
  // Taking whatever the rollup happens to contain makes the decision depend on
  // an API's shape: a Cloudflare preview deployment that sits pending for hours,
  // or never concludes, would either block publishing forever or — as happened
  // in rehearsal — be absent and silently not count. Naming them means the gate
  // is the same set branch protection enforces, and a missing one is a refusal
  // rather than an accident.
  const wanted =
    requiredChecks.length > 0 ? requiredChecks : checks.map(c => c.name);
  const relevant = checks.filter(check => wanted.includes(check.name));

  const failed = relevant.filter(check => check.conclusion === "FAILURE");
  if (failed.length > 0) {
    return no(
      `required checks failed: ${failed.map(c => c.name).join(", ")}`,
      true
    );
  }
  const missing = wanted.filter(
    name =>
      !relevant.some(
        check => check.name === name && check.conclusion === "SUCCESS"
      )
  );
  if (missing.length > 0) {
    return no(`waiting on: ${missing.join(", ")}`);
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
