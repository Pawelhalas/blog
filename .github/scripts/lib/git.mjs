import { execFileSync } from "node:child_process";
import { isPublishedPost, POSTS_DIR } from "./posts.mjs";

/**
 * Whether this process is allowed to change the repository.
 *
 * WRITE_ENABLED gates the write and DRY_RUN gates only the notification, so
 * running a script on a laptop with WRITE_ENABLED=true commits and pushes to
 * main for real. That happened twice while this was being built: once seeding
 * the release log, once fabricating a missed deadline that had to be reverted
 * on main, taking an unmerged pull request along with it.
 *
 * Those flags are per-workflow configuration, not a safety mechanism for local
 * runs. This is the safety mechanism. Pushing is something CI does; a laptop
 * gets to compute the answer and print it.
 */
export const IN_CI = process.env.GITHUB_ACTIONS === "true";

export function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function refExists(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * `main` under `actions/checkout` may be a local branch, a remote-tracking ref,
 * or neither — a cron run checks main out as detached HEAD. Try each in turn
 * rather than assuming the shape of the checkout.
 */
export function mainRef() {
  for (const ref of ["origin/main", "main", "HEAD"]) {
    if (refExists(ref)) return ref;
  }
  throw new Error("no usable ref for main — was the repo checked out?");
}

/** Record separator. Safe: git never emits it in a path or an ISO date. */
const RS = "\x1e";

/**
 * *Last published* is derived from git history, never stored.
 *
 * Nothing to corrupt, nothing to keep in sync, and a post published by hand
 * still registers. The answer is the most recent commit on main that ADDED an
 * un-prefixed post — renames and edits are not publishes.
 *
 * Requires full history: the workflow must check out with `fetch-depth: 0`.
 */
export function lastPublished(ref = mainRef()) {
  const out = git(
    "log",
    ref,
    "--diff-filter=A",
    `--pretty=format:${RS}%H %cI`,
    "--name-only",
    "--",
    POSTS_DIR
  );

  for (const record of out.split(RS)) {
    if (!record.trim()) continue;
    const [header, ...rest] = record.split("\n");
    const [sha, date] = header.trim().split(/\s+/);
    const posts = rest.map(line => line.trim()).filter(isPublishedPost);
    if (posts.length > 0) return { sha, date, posts };
  }
  return null;
}

/** Files present under `posts/` at a given ref. */
export function postsAt(ref) {
  const out = git("ls-tree", "-r", "--name-only", ref, "--", POSTS_DIR);
  return out
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
}

/**
 * The branch defines the scope, not a filename diff.
 *
 * The target post is the un-prefixed file that exists on the branch but not on
 * main. Rename-plus-edit in one push is therefore a non-issue, and two posts at
 * once is impossible by construction. Zero or two candidates is a hard failure,
 * never a guess.
 */
export function releaseCandidates(branchRef = "HEAD", baseRef = mainRef()) {
  const onMain = new Set(postsAt(baseRef).filter(isPublishedPost));
  return postsAt(branchRef)
    .filter(isPublishedPost)
    .filter(path => !onMain.has(path));
}
