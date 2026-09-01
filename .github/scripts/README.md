# Release automation

Drafts live in the repo behind an underscore. Removing the underscore on a
`release/**` branch is the publish signal. Everything mechanical happens in
GitHub Actions, and merging the pull request is the only human step.

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

## The three workflows

| Workflow           | Trigger                                      | Does                                                                                      |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `cadence.yml`      | daily cron                                   | Derives last-published from git, nags at due−2, logs a miss and restarts the clock at due |
| `release.yml`      | push to `release/**`                         | The per-post pipeline, then opens the PR                                                  |
| `post-publish.yml` | push to `main` touching `src/content/posts/` | Records the post in the release log                                                       |

## Switches

Each workflow has an `env:` block at the top holding its own switches. Flip them
there, not in the scripts.

| Switch              | Where                             | Set to   | What that means                                                       |
| ------------------- | --------------------------------- | -------- | --------------------------------------------------------------------- |
| `WRITE_ENABLED`     | `cadence.yml`, `post-publish.yml` | `true`   | They may commit to `main`. Off means observe-only, but they still nag |
| `DRY_RUN_DEFAULT`   | `release.yml`                     | `false`  | A push to `release/**` is a real run: it commits and opens the PR     |
| `APPLY_ORTHOGRAPHY` | `release.yml`                     | `false`  | Findings go in the PR body. On, they are applied under the guard      |
| `IMAGE_QUALITY`     | `release.yml`                     | `medium` | `low` / `medium` / `high` — roughly $0.02 / $0.06 / $0.25 an image    |

`release.yml` and `cadence.yml` also take `workflow_dispatch` inputs that
override the defaults for a single manual run. Both default `dry_run` to
**true**, so a manual dispatch is a rehearsal unless you say otherwise — the
opposite of a push, which is a real run.

Nothing here can write from a laptop. Every commit, push and issue change also
requires `GITHUB_ACTIONS=true`; see `lib/mode.mjs` for why that backstop exists.

## Secrets

| Secret              | Used by       | For                                                                     |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| `RELEASE_PAT`       | all three     | Opening the PR so `ci.yml` actually runs; pushing to a protected `main` |
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
