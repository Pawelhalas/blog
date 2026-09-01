import { appendFileSync } from "node:fs";

import { writeMode, notifyMode } from "./lib/mode.mjs";
import { gh, say, openIssues, raise, LABELS } from "./lib/notify.mjs";
import { shouldMerge } from "./lib/publish-rules.mjs";

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
 * pubDatetime is read from the post as it exists on the branch, not from the
 * cache or the log: the file is what will be published, so the file is what
 * decides when.
 */
function pubDatetimeOf(pr) {
  try {
    const files = pr.files
      .map(file => file.path)
      .filter(
        path => path.startsWith("src/content/posts/") && path.endsWith(".md")
      );
    if (files.length !== 1) return null;
    const text = gh(
      "api",
      `repos/{owner}/{repo}/contents/${files[0]}?ref=${pr.headRefName}`,
      "--jq",
      ".content"
    );
    const decoded = Buffer.from(text, "base64").toString("utf8");
    return decoded.match(/^pubDatetime:\s*(.+)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

function lastCommitSubject(pr) {
  try {
    return gh(
      "api",
      `repos/{owner}/{repo}/commits/${pr.headRefName}`,
      "--jq",
      ".commit.message"
    ).split("\n")[0];
  } catch {
    return "";
  }
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
      pubDatetime: pubDatetimeOf(pr),
      openedAt: pr.createdAt,
      labels: pr.labels.map(label => label.name),
      lastCommitSubject: lastCommitSubject(pr),
      changedPaths: pr.files.map(file => file.path),
      mergeable: pr.mergeable !== "CONFLICTING",
      holdMinutes: HOLD_MINUTES,
    });
    verdicts.push({ pr, decision });
  }

  summary(
    `## Release queue\n\n` +
      verdicts
        .map(
          ({ pr, decision }) =>
            `- ${decision.merge ? "✅" : decision.blocking ? "⛔" : "⏳"} **#${pr.number}** ${pr.title} — ${decision.reason}`
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
