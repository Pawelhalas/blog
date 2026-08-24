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

Each workflow has an `env:` block at the top holding its own switches. They ship
in the safe position; flip them there, not in the scripts.

| Switch              | Where                             | Ships as | Turning it on                                                      |
| ------------------- | --------------------------------- | -------- | ------------------------------------------------------------------ |
| `WRITE_ENABLED`     | `cadence.yml`, `post-publish.yml` | `false`  | Lets them commit to `main`                                         |
| `DRY_RUN_DEFAULT`   | `release.yml`                     | `true`   | Lets the pipeline write, commit and open a PR                      |
| `APPLY_ORTHOGRAPHY` | `release.yml`                     | `false`  | Applies guarded orthography fixes instead of only reporting them   |
| `IMAGE_QUALITY`     | `release.yml`                     | `medium` | `low` / `medium` / `high` — roughly $0.02 / $0.06 / $0.25 an image |

`release.yml` and `cadence.yml` also take `workflow_dispatch` inputs that
override the defaults for a single manual run.

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

## Constraints worth knowing before editing these scripts

- The hero image is the **first markdown image in the body**, not a frontmatter
  field (`src/utils/getHeroImage.ts`). It must live under `src/assets/` and be
  referenced relatively; an absolute path builds clean and ships a dead image.
- Alt text is also the `/posts` thumbnail alt, so it describes the picture, not
  the post.
- `.prettierignore` whitelists `/.github`, so everything here is format-checked
  by `ci.yml`. Run `pnpm run format` after editing.
- Dependencies live in `.github/scripts/package.json`, deliberately separate
  from the site's, so the Anthropic SDK never enters the Astro build.
- Scheduled workflows in a public repo are auto-disabled after 60 days of no
  repository activity. See the comment at the top of `cadence.yml`.
