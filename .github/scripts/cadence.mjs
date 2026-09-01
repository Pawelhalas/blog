import { appendFileSync } from "node:fs";
import { git, lastPublished } from "./lib/git.mjs";
import { notifyMode, writeMode } from "./lib/mode.mjs";
import { closeIssue, gh, openIssues, raise, say } from "./lib/notify.mjs";
import {
  addDays,
  cadenceState,
  LOG_PATH,
  NAG_LEAD_DAYS,
  readLog,
  writeLog,
} from "./lib/release-log.mjs";

/**
 * Cadence check. Runs daily; does nothing on almost every one of those days.
 *
 * At least one post every two weeks. More often is fine. Every publish restarts
 * the clock, and so does a logged miss — the point is a nudge you still read,
 * not a daily notification you learn to filter.
 *
 * WRITE_ENABLED gates the only thing this script writes: the miss log. It ships
 * off, so the first weeks of running it are pure observation.
 */

const WRITE_ENABLED = process.env.WRITE_ENABLED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";
const MODE = writeMode({ writeEnabled: WRITE_ENABLED, dryRun: DRY_RUN });
const NOTIFY = notifyMode({ dryRun: DRY_RUN });

function summary(markdown) {
  say(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

/**
 * Posts already prepared and waiting on their own schedule.
 *
 * A queued post is not a checkpoint — only a merge is — so this never suppresses
 * a nag or a miss. It exists so a reminder to write does not arrive while three
 * finished posts sit in the queue, which would read as the system not knowing
 * what it is doing.
 */
function queuedReleases() {
  try {
    return JSON.parse(
      gh(
        "pr",
        "list",
        "--state",
        "open",
        "--base",
        "main",
        "--limit",
        "20",
        "--json",
        "number,title,headRefName"
      )
    ).filter(pr => pr.headRefName.startsWith("release/"));
  } catch {
    return [];
  }
}

/**
 * How long since the previous scheduled run, in hours, or null if unknown.
 *
 * Measured 25-31 August, GitHub's cron fired every single day but between 0.7
 * and 12.1 hours after the 07:17 it was asked for, with gaps between runs of
 * 17.7 to 34.3 hours. Reliable in occurrence, unreliable in timing.
 *
 * The cadence logic is unaffected, because the boundary is computed in UTC
 * calendar days rather than hours - but a gap well outside that range means
 * runs were dropped, and nothing else in the system would ever say so.
 *
 * Honest limitation: this notices an outage after it ends, never during one.
 * Nothing running inside the thing being watched can do better. An external
 * check is the only real answer to "it stopped and stayed stopped", and for a
 * fortnightly blog that is probably not worth another dependency.
 */
function hoursSincePreviousRun() {
  try {
    const runs = JSON.parse(
      gh(
        "run",
        "list",
        "--workflow=cadence.yml",
        "--event=schedule",
        "--limit",
        "8",
        "--json",
        "createdAt"
      )
    );
    // This run may already be listed; ignore anything from the last few minutes.
    const cutoff = Date.now() - 5 * 60 * 1000;
    const previous = runs
      .map(r => Date.parse(r.createdAt))
      .filter(t => t < cutoff)
      .sort((a, b) => b - a)[0];
    return previous ? (Date.now() - previous) / 3600000 : null;
  } catch {
    return null;
  }
}

/** Beyond this, the schedule has skipped days rather than merely drifted. */
const GAP_ALARM_HOURS = 48;

/**
 * The two title shapes this script owns. Anything else in the issue list was
 * opened by a person and is never touched.
 */
const CADENCE_TITLE = /^Cadence(?:: publish by| missed:) \d{4}-\d{2}-\d{2}$/;

/**
 * Brings the open issues in line with the window this run just computed.
 *
 * Notifications are GitHub's own — an issue, which emails the repo owner with
 * no SMTP secret to hold and nothing to configure. Deduplicated on the exact
 * title so a daily cron cannot open the same nag twice.
 *
 * Opening was the only half that existed, and it left every nag standing
 * forever: one issue asked for a post that had already shipped on time, and
 * another described a miss whose log entry had since been reverted. An issue
 * list that disagrees with `release-log.json` is worse than no issue list,
 * because the log is the one that is right.
 *
 * Reconciling rather than reacting is what makes that self-healing: a stale nag
 * is closed on the next daily run whatever made it stale — a publish, a revert,
 * a hand-edited log — without this script having to be told which.
 *
 * `current` is the issue this window wants open, or null during the quiet
 * stretch when the answer is "none".
 */
function syncNag(current) {
  const all = openIssues();
  const mine = all.filter(issue => CADENCE_TITLE.test(issue.title));

  for (const issue of mine.filter(i => i.title !== current?.title)) {
    closeIssue({
      number: issue.number,
      title: issue.title,
      mode: NOTIFY,
      comment: [
        "This cadence window is over, so the check closed it — the issue list is meant to show only what is still outstanding.",
        "",
        current
          ? `Now open instead: **${current.title}**.`
          : "Nothing is due. The next reminder opens on its own.",
      ].join("\n"),
    });
  }

  if (!current) return;
  raise({ ...current, mode: NOTIFY, existing: all });
}

function main() {
  say(MODE.banner);
  say(NOTIFY.banner);

  const log = readLog();
  const published = lastPublished();

  if (!published) {
    summary(
      "No published post found in git history — nothing to measure a cadence against."
    );
    return;
  }

  // Every date this script reasons about comes from here. See the note on
  // cadenceState: it used to be computed inline, next to a copy in the library
  // that nothing called and that had drifted to the wrong boundary rule.
  const {
    dueAt,
    dueDate,
    daysUntilDue,
    daysSinceLastPublish,
    cadenceDays,
    lastMiss,
  } = cadenceState(log, published.date);

  const gapHours = hoursSincePreviousRun();
  const gapOverdue = gapHours !== null && gapHours > GAP_ALARM_HOURS;

  summary(
    [
      `**Last published:** ${published.posts.join(", ")} on ${published.date.slice(0, 10)} (\`${published.sha.slice(0, 7)}\`)`,
      gapHours === null
        ? null
        : gapOverdue
          ? `**⚠️ Previous scheduled check was ${gapHours.toFixed(0)}h ago** — normal is 18–34h, so the schedule skipped at least a day.`
          : `**Previous scheduled check:** ${gapHours.toFixed(0)}h ago`,
      lastMiss
        ? `**Clock last restarted by a miss:** ${lastMiss.slice(0, 10)}`
        : null,
      `**Due:** ${dueDate} — ${daysUntilDue} day(s) away`,
      `**Cadence:** every ${cadenceDays} days`,
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  if (daysUntilDue > NAG_LEAD_DAYS) {
    // Not "nothing to do": this is the stretch right after a publish, which is
    // exactly when a nag from the window that just closed is still sitting open.
    syncNag(null);
    summary(
      `\nNothing outstanding. Next nag at ${addDays(dueAt, -NAG_LEAD_DAYS).slice(0, 10)}.`
    );
    return;
  }

  // Note the boundary: the due date itself is still on time. The rule is "at
  // least one post every N days", so publishing on day N satisfies it — a miss
  // is only a miss once the day has passed. Nagging on the due date and logging
  // the miss the morning after is the difference between a system that is right
  // and one that calls you late on the day you ship.
  if (daysUntilDue >= 0) {
    const queued = queuedReleases();
    syncNag({
      title: `Cadence: publish by ${dueDate}`,
      body: [
        daysUntilDue === 0
          ? `The ${cadenceDays}-day cadence is due **today**. Publishing any time today counts.`
          : `${daysUntilDue} day(s) until the ${cadenceDays}-day cadence is due.`,
        "",
        `Last published: **${published.posts.join(", ")}** on ${published.date.slice(0, 10)}.`,
        "",
        "To publish: branch, drop the leading underscore from the draft, push. Nothing else —",
        "the post prepares and publishes itself from there.",
        "",
        "```bash",
        "git switch -c release/my-post && git mv src/content/posts/_my-post.md src/content/posts/my-post.md && git commit -am 'Publish my-post' && git push -u origin HEAD",
        "```",
        "",
        ...(queued.length
          ? [
              `**Already queued:** ${queued.map(pr => `#${pr.number} ${pr.title}`).join(", ")}.`,
              "Those are prepared and waiting on their own `pubDatetime`. A queued post is not a",
              "checkpoint — the clock restarts when one actually publishes.",
              "",
            ]
          : []),
        `If nothing has shipped by the end of ${dueDate}, a miss is logged and the clock restarts. Closing this issue does not stop that.`,
        ...(gapOverdue
          ? [
              "",
              `> ⚠️ The previous scheduled check ran ${gapHours.toFixed(0)} hours ago. Normal is 18–34, so the schedule skipped at least a day and this reminder may be later than it looks.`,
            ]
          : []),
      ].join("\n"),
    });
    return;
  }

  // The due date has passed with nothing published: log the miss once, restart
  // the clock once, and stop notifying until the next window opens.
  const miss = {
    dueAt,
    loggedAt: new Date().toISOString(),
    daysSinceLastPublish,
  };

  syncNag({
    title: `Cadence missed: ${dueDate}`,
    body: [
      `The ${cadenceDays}-day cadence came due on ${dueDate} with nothing published.`,
      "",
      `Last published: **${published.posts.join(", ")}** on ${published.date.slice(0, 10)} — ${miss.daysSinceLastPublish} days ago.`,
      "",
      `Miss logged, clock restarted. Next due: ${addDays(dueAt, cadenceDays).slice(0, 10)}. No further notifications until then.`,
    ].join("\n"),
  });

  if (!MODE.may) {
    summary(
      `\n**Nothing written — ${MODE.blockedBy}.** In CI with writes enabled this miss ` +
        `would be committed to \`main\` and the clock restarted. It would have recorded:` +
        `\n\n\`\`\`json\n${JSON.stringify(miss, null, 2)}\n\`\`\``
    );
    return;
  }

  log.misses.push(miss);
  writeLog(log);

  // Pushing to main needs a token that bypasses branch protection — see the
  // checkout step in cadence.yml. This commit is also the only thing keeping
  // the repo "active": GitHub disables scheduled workflows in a repo with no
  // activity for 60 days, which would kill this nag during exactly the quiet
  // stretch it exists to interrupt.
  git("config", "user.name", "github-actions[bot]");
  git(
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  );
  git("add", "--", LOG_PATH);
  git("commit", "-m", `Log a missed publishing window (${dueDate})`);
  git("push", "origin", "HEAD:main");

  summary(
    `\nMiss logged. Clock restarted; next due ${addDays(dueAt, cadenceDays).slice(0, 10)}.`
  );
}

main();
