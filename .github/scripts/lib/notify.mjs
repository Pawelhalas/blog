import { execFileSync } from "node:child_process";

/**
 * Issues are how this system talks to Pawel.
 *
 * GitHub's own notifications, so there is no SMTP secret to hold and nothing to
 * configure, and they reach a phone through the GitHub app. Apple Reminders was
 * considered and is not reachable: these workflows run on a cloud Linux runner
 * with no path to his Mac or iCloud — the same constraint that dropped the
 * macOS reminder from the original design.
 *
 * Extracted from cadence.mjs when publish.mjs needed the same behaviour. One
 * implementation, so "notify" means the same thing in all three scripts.
 */

export const gh = (...args) =>
  execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

export const say = line => process.stdout.write(`${line}\n`);

/** Open issues, as `{ title, number, labels }`. */
export function openIssues() {
  return JSON.parse(
    gh(
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "title,number,labels"
    )
  );
}

/**
 * Opens an issue unless one with the exact same title is already open.
 *
 * Deduplicating on the title is what stops a workflow that runs every 30
 * minutes from filing the same complaint 48 times a day. It means titles have
 * to be stable for a given problem and distinct between problems — which is why
 * callers build them from the thing that is wrong, not from the current time.
 */
export function raise({ title, body, labels = [], mode, existing = null }) {
  const open = existing ?? openIssues();
  const already = open.find(issue => issue.title === title);
  if (already) {
    say(`Issue already open: #${already.number} — ${title}`);
    return { opened: false, number: already.number };
  }
  if (!mode.may) {
    say(`[no-op] would open issue (${mode.blockedBy}): ${title}\n${body}`);
    return { opened: false, number: null };
  }
  const args = ["issue", "create", "--title", title, "--body", body];
  for (const label of labels) args.push("--label", label);
  gh(...args);
  say(`Opened issue: ${title}`);
  return { opened: true, number: null };
}

export function closeIssue({ number, title, comment, mode }) {
  if (!mode.may) {
    say(`[no-op] would close #${number} — ${title} (${mode.blockedBy})`);
    return false;
  }
  gh("issue", "close", String(number), "--comment", comment);
  say(`Closed #${number} — ${title}`);
  return true;
}

/**
 * Labels are created on demand rather than assumed. `gh issue create --label`
 * fails outright on a label that does not exist, which would turn "tell Pawel
 * something is wrong" into a second, silent failure.
 */
export function ensureLabels(specs, mode) {
  if (!mode.may) return;
  for (const { name, colour, description } of specs) {
    try {
      gh(
        "label",
        "create",
        name,
        "--color",
        colour,
        "--description",
        description,
        "--force"
      );
    } catch {
      // A label that already exists, or a token without permission to make one.
      // Neither is worth failing a publish over.
    }
  }
}

export const LABELS = {
  urgent: {
    name: "urgent",
    colour: "B60205",
    description:
      "Automation needs Pawel: publishing is blocked or shipped incomplete",
  },
  automatedRelease: {
    name: "automated-release",
    colour: "0E8A16",
    description: "Opened by release.yml and eligible for automatic publishing",
  },
  hold: {
    name: "hold",
    colour: "5319E7",
    description: "Do not publish automatically",
  },
  needsImage: {
    name: "needs-image",
    colour: "FBCA04",
    description: "Published without a hero image - add one before merging",
  },
};
