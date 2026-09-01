import { appendFileSync } from "node:fs";

import { writeMode, notifyMode } from "./lib/mode.mjs";
import { gh, say, openIssues, raise, LABELS } from "./lib/notify.mjs";
import { addedPost, shouldMerge } from "./lib/publish-rules.mjs";

/**
 * Publishes prepared posts, on schedule, with nobody watching.
 *
 * This is the step that used to be Pawel clicking Merge. It runs every half
 * hour, looks at every open release pull request, and merges at most one.
 *
 * Why a scheduled job rather than GitHub's own auto-merge: auto-merge fires the
 * instant checks go green, which leaves no window to catch a mistake and no way
 * to honour a pubDatetime in the future. Polling gives both for free — the hold
 * window and the schedule are the same mechanism.
 *
 * One merge per run, deliberately. Two merges racing would queue two runs of
 * post-publish.yml against the same log file, and a serial history is easier to
 * read afterwards than a fast one.
 */

const WRITE_ENABLED = process.env.WRITE_ENABLED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";
const MODE = writeMode({ writeEnabled: WRITE_ENABLED, dryRun: DRY_RUN });
const NOTIFY = notifyMode({ dryRun: DRY_RUN });
const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 60);
/**
 * The checks that must be green, named rather than inferred.
 *
 * Must stay in step with branch protection's required contexts. Naming them is
 * what stops the decision depending on whatever the status rollup happens to
 * include - a preview deployment that never concludes would otherwise block
 * every publish, or be quietly absent and gate nothing.
 */
const REQUIRED_CHECKS = (
  process.env.REQUIRED_CHECKS || "Code standards & build,Automation tests"
)
  .split(",")
  .map(name => name.trim())
  .filter(Boolean);

function summary(markdown) {
  say(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

/** Only pull requests this pipeline opened are ever candidates. */
function releasePullRequests() {
  const prs = JSON.parse(
    gh(
      "pr",
      "list",
      "--state",
      "open",
      "--base",
      "main",
      "--limit",
      "50",
      "--json",
      "number,title,headRefName,labels,createdAt,mergeable,files,statusCheckRollup"
    )
  );
  return prs.filter(
    pr =>
      pr.headRefName.startsWith("release/") &&
      pr.labels.some(label => label.name === LABELS.automatedRelease.name)
  );
}

/**
 * When this post is due, or why that could not be established.
 *
 * Fails **closed**. The entire purpose of the schedule is to not publish before
 * a date, so "I could not work out the date" must never resolve to "publish
 * now". It used to: the lookup caught its own errors and returned null, null
 * meant no schedule, and no schedule meant go. A post scheduled for four days
 * later published itself within the minute, and the run log showed only "all
 * gates clear" — the fact it was missing the date was nowhere.
 */
function scheduleOf(pr) {
  const added = addedPost(pr.files);
  if (added.length !== 1) {
    return {
      error: `expected exactly one added post, found ${added.length}: ${added.map(f => f.path).join(", ") || "none"}`,
    };
  }
  let decoded;
  try {
    const text = gh(
      "api",
      `repos/{owner}/{repo}/contents/${added[0].path}?ref=${pr.headRefName}`,
      "--jq",
      ".content"
    );
    decoded = Buffer.from(text, "base64").toString("utf8");
  } catch (error) {
    return {
      error: `could not read ${added[0].path}: ${error.message.split("\n")[0]}`,
    };
  }
  const found = decoded.match(/^pubDatetime:\s*(.+)$/m)?.[1]?.trim();
  if (!found) {
    // release.mjs always writes one, authored or generated. Its absence means
    // the wrong file was read, not that the post is unscheduled.
    return { error: `${added[0].path} has no pubDatetime - refusing to guess` };
  }
  return { value: found };
}

function main() {
  say(MODE.banner);
  say(NOTIFY.banner);

  const prs = releasePullRequests();
  if (prs.length === 0) {
    summary("No release pull requests are open. Nothing to publish.");
    return;
  }

  const existingIssues = openIssues();
  const verdicts = [];

  for (const pr of prs) {
    const schedule = scheduleOf(pr);
    if (schedule.error) {
      verdicts.push({
        pr,
        decision: { merge: false, reason: schedule.error, blocking: true },
      });
      continue;
    }
    const decision = shouldMerge({
      checks: (pr.statusCheckRollup ?? []).map(check => ({
        name: check.name ?? check.context,
        // The REST rollup uses `state`, the checks API uses `conclusion`.
        conclusion:
          check.conclusion ||
          (check.state === "SUCCESS"
            ? "SUCCESS"
            : check.state === "FAILURE" || check.state === "ERROR"
              ? "FAILURE"
              : null),
      })),
      pubDatetime: schedule.value,
      openedAt: pr.createdAt,
      labels: pr.labels.map(label => label.name),
      requiredChecks: REQUIRED_CHECKS,
      changedPaths: pr.files.map(file => file.path),
      mergeable: pr.mergeable !== "CONFLICTING",
      holdMinutes: HOLD_MINUTES,
    });
    verdicts.push({ pr, decision, schedule: schedule.value });
  }

  summary(
    `## Release queue\n\n` +
      verdicts
        .map(
          ({ pr, decision, schedule }) =>
            `- ${decision.merge ? "✅" : decision.blocking ? "⛔" : "⏳"} **#${pr.number}** ${pr.title} — ${decision.reason}` +
            // The inputs, not just the verdict. A wrong input produced a
            // perfectly reasonable-looking "all gates clear" once, and nothing
            // in the log said which facts it had decided on.
            `\n  <sub>scheduled ${schedule ?? "—"} · opened ${pr.createdAt} · labels ${pr.labels.map(l => l.name).join("/") || "none"} · ${pr.files.length} file(s)</sub>`
        )
        .join("\n")
  );

  // Blocked pull requests are the ones a human has to see. The title is built
  // from the PR number so a run every half hour cannot file it repeatedly.
  for (const { pr, decision } of verdicts) {
    if (!decision.blocking) continue;
    raise({
      title: `Publishing blocked: #${pr.number}`,
      body: [
        `\`${pr.title}\` cannot publish itself.`,
        "",
        `**Reason:** ${decision.reason}`,
        "",
        `Pull request: ${pr.number ? `#${pr.number}` : "unknown"}`,
        "",
        "The pull request is still open and nothing was merged. Fixing the cause and",
        "pushing to the branch is enough — the pipeline is resumable, and this issue",
        "will not reopen once the publish succeeds.",
      ].join("\n"),
      labels: [LABELS.urgent.name],
      mode: NOTIFY,
      existing: existingIssues,
    });
  }

  const winner = verdicts.find(({ decision }) => decision.merge);
  if (!winner) {
    summary("\nNothing is ready to publish this run.");
    return;
  }

  if (!MODE.may) {
    summary(
      `\n**Nothing merged — ${MODE.blockedBy}.** In CI with writes enabled, ` +
        `#${winner.pr.number} (${winner.pr.title}) would have been squash-merged and published.`
    );
    return;
  }

  gh("pr", "merge", String(winner.pr.number), "--squash");
  summary(
    `\n**Published #${winner.pr.number}** — ${winner.pr.title}.\n\n` +
      "Cloudflare deploys on merge; `post-publish.yml` records it in the release log."
  );
}

main();
