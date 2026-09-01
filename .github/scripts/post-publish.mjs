import { appendFileSync } from "node:fs";
import { git, mainRef, postsAt } from "./lib/git.mjs";
import { writeMode } from "./lib/mode.mjs";
import {
  isPublishedPost,
  POSTS_DIR,
  slugOf,
  splitFrontmatter,
} from "./lib/posts.mjs";
import { BACKGROUNDS, readLog, writeLog } from "./lib/release-log.mjs";

/**
 * Appends published posts to the release log after they land on main.
 *
 * Reconciles the whole log against git history rather than reading the push
 * event, which makes it idempotent, self-healing, and able to backfill posts
 * published before this workflow existed. Running it twice changes nothing.
 *
 * The log is not the source of truth for *when* the last post shipped — that is
 * derived from git every time (`lib/git.mjs`). What the log adds is the miss
 * history and the hero-image background rotation, neither of which git knows.
 */

const WRITE_ENABLED = process.env.WRITE_ENABLED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";
const MODE = writeMode({ writeEnabled: WRITE_ENABLED, dryRun: DRY_RUN });
const RS = "\x1e";

const say = line => process.stdout.write(`${line}\n`);

function summary(markdown) {
  say(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

const FIRST_IMAGE = /!\[[^\]]*\]\(\s*<?([^)>\s]+)>?/;

/**
 * The background colour is not recorded anywhere but the filename the pipeline
 * chose — `my-post-violet.png`. Reading it back keeps the rotation working even
 * for posts published by hand.
 */
function backgroundOf(ref, path) {
  const { body } = splitFrontmatter(git("show", `${ref}:${path}`));
  const file = body.match(FIRST_IMAGE)?.[1];
  if (!file) return null;
  const stem = file.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");
  return (
    BACKGROUNDS.find(colour => stem.endsWith(`-${colour.split(" ").at(-1)}`)) ??
    null
  );
}

function publishEvents(ref) {
  const out = git(
    "log",
    ref,
    "--reverse",
    "--diff-filter=A",
    `--pretty=format:${RS}%H %cI`,
    "--name-only",
    "--",
    POSTS_DIR
  );

  // Only posts still on main. History also contains the twenty AstroPaper demo
  // posts the theme shipped with and that were deleted long ago — logging those
  // would fill the published list with boilerplate and poison the background
  // rotation with colours no post of Pawel's ever used.
  const live = new Set(postsAt(ref).filter(isPublishedPost));

  const events = [];
  for (const record of out.split(RS)) {
    if (!record.trim()) continue;
    const [header, ...rest] = record.split("\n");
    const [commit, publishedAt] = header.trim().split(/\s+/);
    for (const path of rest.map(line => line.trim())) {
      if (!live.has(path)) continue;
      events.push({ slug: slugOf(path), path, publishedAt, commit });
    }
  }
  return events;
}

function main() {
  say(MODE.banner);

  const ref = mainRef();
  const log = readLog();
  const known = new Set(log.published.map(entry => entry.commit + entry.slug));

  const added = [];
  for (const event of publishEvents(ref)) {
    if (known.has(event.commit + event.slug)) continue;
    added.push({ ...event, imageBackground: backgroundOf(ref, event.path) });
  }

  if (added.length === 0) {
    summary("Release log is already up to date.");
    return;
  }

  log.published.push(...added);
  log.published.sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt)
  );

  summary(
    `Appending ${added.length} entr${added.length === 1 ? "y" : "ies"} to the release log:\n\n` +
      added
        .map(
          e =>
            `- **${e.slug}** — ${e.publishedAt.slice(0, 10)} (\`${e.commit.slice(0, 7)}\`, background: ${e.imageBackground ?? "unknown"})`
        )
        .join("\n")
  );

  if (!MODE.may) {
    summary(
      `\n**Nothing written — ${MODE.blockedBy}.** In CI with writes enabled the entries ` +
        "above would be committed to `main`."
    );
    return;
  }

  writeLog(log);

  if (
    git("status", "--porcelain", "--", ".github/release-log.json").trim() === ""
  ) {
    summary("\nNo change to commit.");
    return;
  }

  git("config", "user.name", "github-actions[bot]");
  git(
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  );
  git("add", "--", ".github/release-log.json");
  git("commit", "-m", "Record published post(s) in the release log");
  git("push", "origin", "HEAD:main");
  summary("\nRelease log updated on main.");
}

main();
