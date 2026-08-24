---
name: blog-post-builder
description: Draft, structure and publish a new blog post in this AstroPaper v6 repo. Use when the user says they want to write, draft, or publish a post, has raw notes to turn into a post, or asks for help with a title, filename, tags, or description for a post. Handles the frontmatter schema, filename-as-URL rule, tag reuse, and the push-to-deploy workflow.
---

# Blog post builder

Creates a post in `src/content/posts/` that satisfies the collection schema in
`src/content.config.ts` and builds without errors.

Verify the schema against `src/content.config.ts` before writing. If it has changed since this
skill was written, trust the repo and tell the user this skill is stale.

---

## Step 1 - Establish the post

Ask only what you can't infer. Don't interrogate.

- Is there existing raw text, or are we starting from an idea?
- English or Polish? (Posts are one or the other, never both.)
- Is this a blog post or a portfolio case study? Case studies have no template yet - stop and
  say so rather than improvising one.

## Step 2 - Choose the filename carefully

**The filename is the permalink.** Routing derives the URL from the file path
(`src/utils/getPostPaths.ts`):

- `posts/why-roadmaps-fail.md` -> `/posts/why-roadmaps-fail`
- `posts/case-studies/foo.md` -> `/posts/case-studies/foo`

A `slug:` key in frontmatter *does* override the final URL segment - Astro's glob loader reads
it from raw frontmatter before zod validation, so it works despite not being in the schema.
**Repo convention: don't use it.** Name the file as the permalink instead. Only reach for `slug`
to rename a published post without breaking its existing URL, and say so explicitly when you do.

Rules:

- lowercase, hyphen-separated, no dates in the filename
- keep it short and stable - changing it later breaks inbound links
- Polish posts: use ASCII, strip diacritics (`dlaczego-roadmapy-zawodza`)
- offer 2-3 filename options and say which you'd pick and why

`.md` by default. Use `.mdx` only when the post needs a component (e.g. `ResponsiveTable`).

## Step 3 - Frontmatter

```markdown
---
title: Why most roadmaps fail
description: Roadmaps break down when they promise dates instead of outcomes. What to do instead.
pubDatetime: 2026-08-05T09:00:00Z
tags:
  - product management
  - roadmapping
---
```

**Required:** `title`, `description`, `pubDatetime` (a date, ISO 8601).

**Optional:** `author` (defaults to config), `modDatetime`, `featured`, `draft`, `ogImage`,
`canonicalURL`, `hideEditPost`, `timezone`.

Do **not** invent fields. There is no `excerpt`, `added`, `updated`, `note`, `keywords` or
`lang`. Anything not in the schema is dropped silently - it will look like it worked and won't.
(`slug` is the one exception: not in the schema, but consumed by the loader for the URL. See
Step 2 - avoid it anyway.)

Notes:

- `description` is the SEO meta description *and* the text rendered into the dynamic OG image.
  Keep it under ~160 characters and make it read as a sentence, not a keyword list.
- `title` also renders into the OG image. Long titles wrap badly - under ~60 characters.
- Omit `ogImage` unless there's a real image. The Satori dynamic OG is the better default.

## Step 4 - Tags

Authoritative source: `.claude/rules/content-workflow.md` (tag vocabulary, agreed
2026-08-13). If it has changed since this skill was written, trust the rules file and tell the
user this skill is stale.

Reuse existing tags rather than inventing near-duplicates. Read the tags already in use:

```
grep -rh -A5 '^tags:' src/content/posts/*.md src/content/posts/*.mdx | grep '^\s*-' | sort -u
```

- lowercase, except proper nouns and acronyms (`AI`, `Anthropic`, `Claude Code`)
- spaces, never underscores or hyphens - `slugifyStr` converts spaces to hyphens in the URL
- 2-3 per post; prefer reusing an existing tag over minting a new one
- if you propose a new tag, say explicitly that it's new and what existing tag it's closest to
- omitting `tags` silently assigns `["others"]` - always set them

## Step 5 - Draft the post

- Keep the user's voice. Direct, conversational, no filler. Don't inflate short posts.
- Structure with `##` headings. Sentence case, per the design spec.
- No `# H1` in the body - the layout renders the title.
- Flag grammar and syntax problems and propose fixes; don't silently rewrite their meaning.
- End with something the reader can act on, when the post supports it. Don't bolt one on.

## Step 6 - Hiding work in progress

Two different mechanisms:

| Goal | Method | Effect |
|---|---|---|
| Written, not ready to show | `draft: true` | Builds, hidden from indexes, URL still reachable |
| Rough notes, keep out of build | prefix file or folder with `_` | Excluded from the collection entirely |

The collection glob is `**/[^_]*.{md,mdx}`.

## Step 7 - Publish

```
npm run build     # runs astro check first; a schema error fails here
git add src/content/posts/<file>
git commit -m "Add post: <title>"
git push
```

Cloudflare Pages auto-deploys on push to `main`.

**Do not future-date a post to schedule it.** A future `pubDatetime` hides the post, but
Cloudflare only rebuilds on push - nothing will publish it when the date arrives. Either use a
current datetime, or push again after the date passes.

Always run `npm run build` before pushing. A frontmatter error fails the deploy, not just the
local build.

---

## Out of scope

- **Hero images.** No image style has been decided. Ask rather than generating something.
- **Polish-language routing.** There is no `lang` field. A Polish post will build and publish
  fine, but nothing marks it as Polish. Adding that means editing `src/content.config.ts` -
  raise it, don't do it as part of writing a post.
