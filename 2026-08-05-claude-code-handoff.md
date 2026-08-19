# Handoff → Claude Code

**Date:** 2026-08-05
**Branch:** `setup/knowledge-base` (off `main`)
**State:** all changes uncommitted

Session goal was to build a local knowledge base in the repo, replacing reliance on the
claude.ai project memory (which lives on Anthropic's servers, is read-only from the desktop app,
and turned out to contain two wrong assumptions — see *Corrections* below).

---

## What changed

| File | Change |
|---|---|
| `AGENTS.md` | Rewritten. 874 bytes → ~9.7 KB. |
| `CLAUDE.md` | Restored as a symlink → `AGENTS.md`. |
| `.claude/skills/blog-post-builder/SKILL.md` | New file, untracked. |

### `AGENTS.md`

Now the single source of truth. Contains:

- project context and two audiences
- stack, versions, dev/build/lint commands
- content workflow — verified frontmatter schema, URL derivation, `_` prefix behaviour,
  scheduled-post trap
- the full Shōtengai design spec (tokens, 9 rules, work order, quality gate) — carried over
  unchanged from the old `CLAUDE.md`
- working agreements
- open decisions, pulled out of claude.ai project memory so the repo no longer depends on it

### `CLAUDE.md` symlink

AstroPaper ships `CLAUDE.md` as a symlink to `AGENTS.md`. A prior session overwrote the symlink
with a real file, which left git showing a typechange and the two files saying different things.
The symlink is restored, so Claude Code, Cursor, Codex and anything else reading `AGENTS.md` all
get the same content. Matches upstream, so future theme updates won't conflict.

### `blog-post-builder` skill

Written against the actual schema in `src/content.config.ts`. Covers filename choice, frontmatter,
tag reuse, draft vs `_` prefix, and the publish sequence.

---

## Corrections made during the session

Two claims were asserted confidently and then found to be wrong. Both were fixed in
`AGENTS.md` and `SKILL.md`, but the **claude.ai project memory still carries them** — correct it
there when convenient.

1. **`slug:` frontmatter is not inert.** Astro's glob loader (`generateIdDefault` in
   `node_modules/astro/dist/content/loaders/glob.js`) reads `data.slug` from raw frontmatter
   *before* zod validation. It overrides the final URL segment even though `slug` is absent from
   the schema and is stripped from `entry.data` afterwards. Subfolder segments still come from
   the file path.
   **Repo convention adopted:** name the file as the permalink, don't use `slug`. Reserve it for
   renaming a published post without breaking its URL.

2. **Mixed PL/EN posting is not a frontmatter-only change.** There is no `lang` field in the
   schema. `src/i18n/` exists but ships `en.ts` only. A Polish post will build and publish, but
   nothing marks it as Polish. Adding that requires editing `src/content.config.ts`.

---

## Not verified

**The build was never run.** `node_modules` is macOS-native; the desktop app's shell is a Linux
sandbox, so the rolldown native binding fails to load. `npm install` was deliberately *not* run —
it would have clobbered the working install on the mounted folder.

**Run `npm run build` locally before committing.** It runs `astro check` first, so a schema error
fails there rather than in the Cloudflare deploy.

Also unverified: `astro dev --background`. It came from AstroPaper's boilerplate and is not in
`package.json` (which defines plain `astro dev`). Confirm it works in Astro 7 or drop it from
`AGENTS.md`.

---

## Next steps

```bash
cd ~/Documents/sites/blog
npm run build
git add AGENTS.md CLAUDE.md .claude/
git commit -m "Restructure agent knowledge base, add blog-post-builder skill"
```

Then, in Claude Code:

> Read CLAUDE.md. Start work order step 1, de-template the config. Stop and show me before
> deleting the demo posts.

**Work order step 1** — `astro-paper.config.ts` is still 100% AstroPaper defaults:

- `site.url` → currently `https://astro-paper.pages.dev/`
- `site.title`, `site.description`, `site.profile`
- `site.author` → currently `Sat Naing`
- `site.timezone` → currently `Asia/Bangkok`, should be `Europe/Warsaw`
- all four `socials` entries are placeholders
- `features.editPost.url` → points at `satnaing/astro-paper`
- favicon and default OG image
- 13 demo posts in `src/content/posts/` — read before deleting, they document configuration

---

## Do not build these in Claude Code

Marked "not designed yet" in the spec. They are design decisions, not implementation:

- **Step 6 — post page.** Two options need proposing first.
- **Step 8 — responsive.** The fixed date column must collapse below ~480px; how is undecided.
- **Step 9 — a11y and focus states.** Undesigned.

Bring these to a planning conversation rather than improvising them from the homepage.

---

## Loose end

The old `blog-post-builder` skill still exists at the plugin level (outside this repo). It
targets `src/notes/`, uses fields that don't exist in this schema (`added`, `updated`, `excerpt`,
`note`), and describes daily automated builds that don't happen — Cloudflare only builds on push.
It will compete with the repo skill. Delete it from the plugin config.

---

## Deferred decisions

Unresolved, recorded in `AGENTS.md`:

- **Domain** — `pawelhalas.com` recommended, not purchased. Site title stays separate from domain.
- **PL/EN weighting** — depends on whether the job search is Poland-only or Europe/remote.
- **`lang` field** — needs a schema change before any Polish post ships.
- **Analytics** — GoatCounter under evaluation; retention needs verifying. Cloudflare's 30-day
  window ruled out.
- **Case study template** — no AstroPaper precedent, undesigned.
