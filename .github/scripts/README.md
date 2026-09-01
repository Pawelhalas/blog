# Release automation

Drafts live in the repo behind an underscore. Removing the underscore on a
`release/**` branch is the publish signal. Everything after that happens in
GitHub Actions, **including the merge** — there is no human step.

Design and the reasoning behind each decision: `docs/release-automation-plan.md`
(private repo).

## Publishing a post

```bash
git switch -c release/my-post
git mv src/content/posts/_my-post.md src/content/posts/my-post.md
git commit -am "Publish my-post" && git push -u origin HEAD
```

A draft carries `title` and body only. `description`, `tags`, `pubDatetime`,
`featured` and the hero image are the pipeline's job. **The filename is the
permalink** — choose it before publishing, because renaming later breaks the URL.

## The four workflows

| Workflow           | Trigger                                      | Does                                                                                      |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `cadence.yml`      | daily cron                                   | Derives last-published from git, nags at due−2, logs a miss and restarts the clock at due |
| `release.yml`      | push to `release/**`                         | The per-post pipeline, then opens the PR                                                  |
| `publish.yml`      | every 30 minutes                             | Merges one prepared post when it is due. This is the step that used to be a person        |
| `post-publish.yml` | push to `main` touching `src/content/posts/` | Records the post in the release log                                                       |

## Switches

Each workflow has an `env:` block at the top holding its own switches. Flip them
there, not in the scripts.

| Switch              | Where                             | Set to   | What that means                                                       |
| ------------------- | --------------------------------- | -------- | --------------------------------------------------------------------- |
| `WRITE_ENABLED`     | `cadence.yml`, `post-publish.yml` | `true`   | They may commit to `main`. Off means observe-only, but they still nag |
| `DRY_RUN_DEFAULT`   | `release.yml`                     | `false`  | A push to `release/**` is a real run: it commits and opens the PR     |
| `APPLY_ORTHOGRAPHY` | `release.yml`                     | `true`   | Provably-safe classes are applied; everything else is reported only   |
| `IMAGE_QUALITY`     | `release.yml`                     | `medium` | `low` / `medium` / `high` — roughly $0.02 / $0.06 / $0.25 an image    |

`release.yml` and `cadence.yml` also take `workflow_dispatch` inputs that
override the defaults for a single manual run. Both default `dry_run` to
**true**, so a manual dispatch is a rehearsal unless you say otherwise — the
opposite of a push, which is a real run.

Nothing here can write from a laptop. Every commit, push and issue change also
requires `GITHUB_ACTIONS=true`; see `lib/mode.mjs` for why that backstop exists.

## Publishing happens without you

`publish.yml` looks at every open release pull request every half hour and merges
**at most one**, when all of these hold:

- required checks are green
- `now` has reached the post's `pubDatetime`, if it has one
- the pull request has been open for `HOLD_MINUTES` (default 60)
- there is no `hold` label
- it touches **only** `src/content/posts/**` and `src/assets/images/**`

That last one is a security control, not tidiness. An unattended merge bot that
can land changes to `.github/` can rewrite the rules it runs under, on a public
repo where anyone can open a pull request. A release pull request touching
anything else is refused and raises an urgent issue.

GitHub's own auto-merge is deliberately **not** used: it fires the moment checks
go green, which leaves no window to catch a mistake and no way to honour a future
`pubDatetime`. Polling gives both, because the hold window and the schedule turn
out to be the same mechanism.

### Scheduling a post

Put a `pubDatetime` in the draft's frontmatter and it becomes the publication
time — the pull request waits until then:

```yaml
---
title: Nowa automatyzacja
pubDatetime: 2026-09-20T09:00:00Z
---
```

Omit it and the post goes out as soon as the checks and the hold window allow.
`description`, `tags`, `featured` and the hero image remain the automation's job.

**One branch, one post.** That is what gives each post its own pull request and
therefore its own schedule. Several un-prefixed posts on a single branch is a
hard failure; put each on its own `release/<slug>` branch and stagger them with
`pubDatetime`. The open pull requests are the queue.

### Stopping a publish

```bash
gh pr edit <number> --remove-label hold   # release it
gh pr edit <number> --add-label hold      # stop it
git commit -m "Publish my-post [hold]"    # prepare it, but hold it
```

**The label is the switch.** `[hold]` in a pushed commit subject only _sets_ the
label, at prepare time, so a post can be held before its pull request exists.

It works that way because the obvious design does not: `release.yml` commits its
own `Prepare <slug> for publishing` on top of whatever you pushed, so the marker
is never the branch's last commit. Reading it there looked correct, passed its
tests, and never once fired — a rehearsal published a post that had asked to be
held. One switch, in one place, is why that cannot happen again.

Holding raises no alarm; it is a normal thing to do. Closing the pull request
cancels the post entirely, leaving the branch and the draft intact.

### What it decides on its own, and what it asks about

| Situation                                        | Outcome                                             |
| ------------------------------------------------ | --------------------------------------------------- |
| Hero image fails both retries                    | **Publishes**, labelled `needs-image`, urgent issue |
| Suggestion that would change which word is used  | **Publishes**, correction reported and not applied  |
| A new tag was minted                             | **Publishes**, noted in the PR body                 |
| Checks red, conflicts, stray file paths          | **Blocks**, urgent issue, PR left open              |
| No post, several posts, `.mdx`, no title, `\---` | **Blocks**, urgent issue                            |
| Unreadable `pubDatetime`                         | **Blocks** — `z.date()` would fail the build anyway |

"Blocks" always means the pull request stays open and nothing merges. Fixing the
cause and pushing is enough; the pipeline is resumable.

## Your words stay yours

Orthography is applied without anyone reading the diff first, so the limit is
enforced in code rather than asked for in a prompt. `correctionClass()` in
`lib/orthography.mjs` sorts every proposed correction into:

| Class        | Example              | Applied?  |
| ------------ | -------------------- | --------- |
| `diacritics` | `zgineło → zginęło`  | yes       |
| `case`       | `polska → Polska`    | yes       |
| `split`      | `napewno → na pewno` | yes       |
| `other`      | `morze → może`       | **never** |

The first three change how a word is spelled. `other` changes _which word it is_
— and `morze` and `może` are both real Polish words, so nothing here can know
which one you meant. Those are reported in the pull request body and left alone.

The cost is deliberate and worth knowing: a real typo needing a letter added or
removed (`widzalem → widziałem`) classifies as `other` and will reach the live
post. Reporting a real error is a smaller failure than silently replacing a word
you chose.

## Secrets

| Secret              | Used by       | For                                                                     |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| `RELEASE_PAT`       | all four      | Opening the PR so `ci.yml` actually runs; pushing to a protected `main` |
| `ANTHROPIC_API_KEY` | `release.yml` | Description, tags, image brief, orthography                             |
| `OPENAI_API_KEY`    | `release.yml` | The hero image (`gpt-image-1`)                                          |

`RELEASE_PAT` must be a fine-grained PAT with **contents: write** and
**pull requests: write**. It cannot be `GITHUB_TOKEN`: GitHub's docs state that
`GITHUB_TOKEN`-triggered events "do not create workflow runs at all", so a PR
opened with the default token would skip `ci.yml` entirely and publish a post
that was never type-checked.

The pipeline's own commit back to the release branch deliberately uses the
default token, for the same reason in reverse — it must not retrigger
`release.yml`.

## When something goes wrong

| When                                | Then                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `astro check`, lint or format fails | PR goes red, merge blocked. Fix locally, push to the same branch                                                |
| Image generation fails              | One retry, then the PR opens without an image, labelled `needs-image`                                           |
| Image is valid but wrong            | Push an empty commit containing `[reimage]` — only the image is regenerated, frontmatter and copy are untouched |
| Zero or two candidate posts         | Hard failure with the file list. One branch, one post                                                           |
| Post is `.mdx`                      | Hard failure. MDX entries expose no `body`, so `getHeroImage.ts` can never find a hero image                    |

## The hero image is decided once

`gpt-image-1` is not deterministic, so the same prompt drawn twice gives two
different pictures. An early version regenerated on every run, which meant the
dry-run preview showed you one image and the real run published another — a
checkpoint that decided nothing, and worse than having no preview at all.

So the first run for a branch draws the image and uploads it as the
`hero-image-preview` artifact; every later run on that branch pulls it back and
reuses it. What you approve is what ships. `[reimage]` is the deliberate
exception — it ignores the preview and draws something new, which is the whole
point of it.

## Cadence issues close themselves

The daily check reconciles the issue list against the window it just computed,
rather than only opening things. Any issue titled `Cadence: publish by <date>`
or `Cadence missed: <date>` that is not the current window gets closed with a
comment. Issues you opened yourself are never touched — the match is on those
two title shapes.

That makes it self-healing: a nag goes away on the next daily run whatever made
it stale, whether that was a publish, a revert of a logged miss, or a hand-edited
log. It matters because the issue list and `release-log.json` disagreeing is
worse than having no issue list, and the log is the one that is right.

Closing a nag by hand still does not dismiss it — the next run reopens it,
because the window really is still open. Publish, or wait for the miss.

## Tests

```bash
cd .github/scripts && pnpm test
```

Node's built-in runner, no test framework. `test/` covers the pure functions —
the orthography guard, the frontmatter surgery, the publish signal and the
cadence boundary. The **Automation tests** job in `ci.yml` runs them on every
pull request and is a required check, so a broken script cannot reach `main`.

Anything that talks to git, the network or an API is deliberately not covered.
Mocking those buys little and rots; the value is in the pure logic, which is
also where every bug in this system's history actually lived.

One test is marked `KNOWN GAP` — word-split corrections (`napewno` → `na pewno`)
are dropped by the guard. It pins current behaviour on purpose. When that is
fixed, change the test deliberately rather than discovering it went red.

## Constraints worth knowing before editing these scripts

- The hero image is the **first markdown image in the body**, not a frontmatter
  field (`src/utils/getHeroImage.ts`). It must live under `src/assets/` and be
  referenced relatively; an absolute path builds clean and ships a dead image.
- Alt text is also the `/posts` thumbnail alt, so it describes the picture, not
  the post.
- `.prettierignore` whitelists `/.github`, so everything here is format-checked
  by `ci.yml`. Run `npm run format` **from the repo root** after editing — this
  folder is its own pnpm root but has no `format` script of its own.
- The scripts resolve paths from the repo root, so run them from there
  (`node .github/scripts/cadence.mjs`), not from inside this folder.
- This folder is its own pnpm root, not part of the site's project — that is
  what `pnpm-workspace.yaml` here is for. It keeps the Anthropic SDK out of the
  site's lockfile and stops it being installed on every CI build of the site.
  Install with `pnpm install` from inside this folder, never from the repo root.
- Scheduled workflows in a public repo are auto-disabled after 60 days of no
  repository activity. See the comment at the top of `cadence.yml`.
