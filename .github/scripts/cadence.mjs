import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { git, lastPublished } from "./lib/git.mjs";
import {
  addDays,
  CADENCE_DAYS,
  DAY_MS,
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

const say = line => process.stdout.write(`${line}\n`);

function summary(markdown) {
  say(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

/** UTC calendar days, so a cron at 07:00 UTC doesn't round a due date sideways. */
const utcDay = value => Math.floor(Date.parse(value) / DAY_MS);

/**
 * Notifications are GitHub's own — an issue, which emails the repo owner with
 * no SMTP secret to hold and nothing to configure. Deduplicated on the exact
 * title so a daily cron cannot open the same nag twice.
 */
function notify(title, body) {
  const open = JSON.parse(
    gh(
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "title,number"
    )
  );
  const existing = open.find(issue => issue.title === title);

  if (existing) {
    say(`Issue already open: #${existing.number} — ${title}`);
    return;
  }
  if (DRY_RUN) {
    say(`[dry-run] would open issue: ${title}\n${body}`);
    return;
  }
  gh("issue", "create", "--title", title, "--body", body);
  say(`Opened issue: ${title}`);
}

function main() {
  const log = readLog();
  const cadenceDays = log.cadenceDays ?? CADENCE_DAYS;
  const published = lastPublished();

  if (!published) {
    summary(
      "No published post found in git history — nothing to measure a cadence against."
    );
    return;
  }

  const lastMiss = log.misses.at(-1)?.dueAt ?? null;
  const startedAt = [published.date, lastMiss]
    .filter(Boolean)
    .reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b));

  const dueAt = addDays(startedAt, cadenceDays);
  const daysUntilDue = utcDay(dueAt) - utcDay(new Date().toISOString());
  const dueDate = dueAt.slice(0, 10);

  summary(
    [
      `**Last published:** ${published.posts.join(", ")} on ${published.date.slice(0, 10)} (\`${published.sha.slice(0, 7)}\`)`,
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
    summary(
      `\nNothing to do. Next nag at ${addDays(dueAt, -NAG_LEAD_DAYS).slice(0, 10)}.`
    );
    return;
  }

  // Note the boundary: the due date itself is still on time. The rule is "at
  // least one post every N days", so publishing on day N satisfies it — a miss
  // is only a miss once the day has passed. Nagging on the due date and logging
  // the miss the morning after is the difference between a system that is right
  // and one that calls you late on the day you ship.
  if (daysUntilDue >= 0) {
    notify(
      `Cadence: publish by ${dueDate}`,
      [
        daysUntilDue === 0
          ? `The ${cadenceDays}-day cadence is due **today**. Publishing any time today counts.`
          : `${daysUntilDue} day(s) until the ${cadenceDays}-day cadence is due.`,
        "",
        `Last published: **${published.posts.join(", ")}** on ${published.date.slice(0, 10)}.`,
        "",
        "To publish: branch, drop the leading underscore from the draft, push.",
        "",
        "```bash",
        "git switch -c release/my-post && git mv src/content/posts/_my-post.md src/content/posts/my-post.md && git commit -am 'Publish my-post' && git push -u origin HEAD",
        "```",
        "",
        `If nothing has shipped by the end of ${dueDate}, a miss is logged and the clock restarts. Closing this issue does not stop that.`,
      ].join("\n")
    );
    return;
  }

  // The due date has passed with nothing published: log the miss once, restart
  // the clock once, and stop notifying until the next window opens.
  const miss = {
    dueAt,
    loggedAt: new Date().toISOString(),
    daysSinceLastPublish:
      utcDay(new Date().toISOString()) - utcDay(published.date),
  };

  notify(
    `Cadence missed: ${dueDate}`,
    [
      `The ${cadenceDays}-day cadence came due on ${dueDate} with nothing published.`,
      "",
      `Last published: **${published.posts.join(", ")}** on ${published.date.slice(0, 10)} — ${miss.daysSinceLastPublish} days ago.`,
      "",
      `Miss logged, clock restarted. Next due: ${addDays(dueAt, cadenceDays).slice(0, 10)}. No further notifications until then.`,
    ].join("\n")
  );

  if (!WRITE_ENABLED) {
    summary(
      `\n\`WRITE_ENABLED\` is off — miss **not** written to the log:\n\n\`\`\`json\n${JSON.stringify(miss, null, 2)}\n\`\`\``
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
