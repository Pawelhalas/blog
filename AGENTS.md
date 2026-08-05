# Pawel Halas — personal blog

Personal blog and portfolio for Pawel Halas, product owner, Wrocław.
Repo: `Pawelhalas/blog`. Deployed to Cloudflare Pages, auto-deploys on push to `main`.

Two audiences: hiring managers (portfolio credibility) and PM practitioners (blog readership).
Posts are written in English *or* Polish — never both. No translation pairs.

---

## Stack

- **Astro 7** + **AstroPaper v6.1.0** (satnaing/astro-paper, MIT)
- **Tailwind 4** (via `@tailwindcss/vite`)
- MDX, Pagefind search, RSS, sitemap, Satori dynamic OG images
- Node ≥ 22.12.0
- Editor: Typora. Git operations handled by the agent, not the editor.

We are **restyling AstroPaper in place**, not replacing it. Its architecture stays: content
collections, Pagefind search, tag index and per-tag pages, RSS, sitemap, dynamic OG images.
Only the visual layer changes.

**Do not** swap in another theme, add a UI component library, or introduce a CSS framework
beyond the Tailwind 4 already present.

---

## Development

Start the dev server in background mode:

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, `astro dev logs`.

Other commands:

```
npm run build        # astro check && astro build && pagefind && copy to public/
npm run format       # prettier --write .
npm run lint         # eslint .
```

`npm run build` runs `astro check` first — a type error fails the build, and therefore the
Cloudflare deploy. Run it before pushing.

Astro docs: https://docs.astro.build — consult the
[routing](https://docs.astro.build/en/guides/routing/),
[components](https://docs.astro.build/en/basics/astro-components/),
[content collections](https://docs.astro.build/en/guides/content-collections/) and
[styling](https://docs.astro.build/en/guides/styling/) guides before related work.

---

## Content workflow

Typora → `git add/commit/push` → Cloudflare auto-deploys.

### Where posts live

`src/content/posts/` — `.md` or `.mdx`.

### The URL comes from the filename, optionally overridden by `slug`

By default the route is derived from the file path (`src/utils/getPostPaths.ts`):

- `posts/my-post.md` → `/posts/my-post`
- `posts/examples/my-post.md` → `/posts/examples/my-post`

A `slug:` key in frontmatter **overrides the final URL segment**. Astro's glob loader
(`generateIdDefault`, `node_modules/astro/dist/content/loaders/glob.js`) reads `data.slug` from
raw frontmatter *before* zod validation, so it takes effect even though `slug` is not in the
schema and is stripped from `entry.data` afterwards. Subfolder segments still come from the file
path regardless:

- `posts/examples/my-post.md` + `slug: other` → `/posts/examples/other`

Convention for this repo: **name the file as the permalink and don't use `slug`.** Two sources of
truth for one URL is a trap. Reserve `slug` for renaming a published post without breaking its
URL. Several AstroPaper demo posts use it; that's theme convention, not ours.

### Underscore prefix excludes from build

Collection glob is `**/[^_]*.{md,mdx}`. Any file **or folder** starting with `_` is excluded
entirely (e.g. `_releases/`, `_color-schemes/`). Useful for drafts you don't want built at all —
distinct from `draft: true`, which still builds but hides.

### Frontmatter schema

Authoritative source: `src/content.config.ts`. Do not invent fields.

**Required**

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `description` | string | used for SEO meta and OG image |
| `pubDatetime` | date | ISO 8601, e.g. `2026-08-05T09:00:00Z` |

**Optional**

| Field | Type | Default | Notes |
|---|---|---|---|
| `author` | string | config `site.author` | |
| `tags` | string[] | `["others"]` | |
| `modDatetime` | date \| null | — | set on meaningful edits |
| `featured` | boolean | — | pins to homepage |
| `draft` | boolean | — | builds but hidden from indexes |
| `ogImage` | image \| string | — | falls back to dynamic Satori OG |
| `canonicalURL` | string | — | set only for cross-posts |
| `hideEditPost` | boolean | — | |
| `timezone` | string | config `site.timezone` | |

There is **no `lang` field**. Mixed PL/EN posting requires editing the schema in
`src/content.config.ts` first. `src/i18n/` exists but ships `en.ts` only.

### Scheduled posts

A `pubDatetime` in the future hides the post until that time — but Cloudflare only rebuilds on
push, so a future-dated post will not appear on its own. Either publish with a past/current
datetime, or push again after the date passes.

---

## Design spec — "Shōtengai"

### Direction

Muji supplies the system: restraint, no ornament, function-first typography. Shimokitazawa /
Akasaka / Nakano supply the materials: warm paper tones, faded signage colour, small densely-set
labels, worn rather than polished.

Explicitly **not** neon, cyberpunk, synthwave, or glow effects.

Governing tension: Muji is emptiness, those neighbourhoods are density. The page is airy
everywhere **except** the tag index, which is deliberately packed. One dense block reads as
intentional; two read as clutter.

### Tokens

Light is the default mode. Dark is available via the existing theme toggle.

| Token              | Light (default) | Dark      |
| ------------------ | --------------- | --------- |
| Background         | `#F4F0E7`       | `#14120F` |
| Text primary       | `#1F1C17`       | `#EDE7DA` |
| Text secondary     | `#6B655B`       | `#9A9184` |
| Text muted         | `#98917F`       | `#625B51` |
| Hairline strong    | `#DDD6C8`       | `#2A2621` |
| Hairline subtle    | `#E4DED2`       | `#201D19` |
| Accent (vermilion) | `#C9522E`       | `#C9522E` |

Define these as CSS custom properties in `src/styles/theme.css`. No hardcoded hex outside that
one file.

### Rules

1. **Warm neutrals only.** No blue-grey, no pure `#000` or `#FFF`. Background is paper or ink.
2. **One accent, ~4 uses per page maximum** — wordmark bar, RSS link, active tag, current nav
   item. Never apply it to body links wholesale.
3. **Structure from hairlines and alignment.** 0.5px rules. No cards, no background fills, no
   shadows, no rounded chips, no border-radius above 2px.
4. **Two typefaces, two jobs.** Neutral sans for anything read as prose. Monospace strictly for
   machine data — dates, counts, tag labels, footer. **Never set body copy in monospace.**
5. **Dates in a fixed-width left column** on every index page. Format `DD·MM·YY`, middle dot
   separator.
6. **Metadata set small and tracked wide** — 10.5–11px, letter-spacing 0.03–0.16em. Reads like a
   printed ticket.
7. **Body copy ≥18px, measure 65–75ch, line-height ~1.6.** This is a reading site; it is the one
   rule that outranks aesthetics.
8. **Wordmark** = 3px vermilion vertical bar + lowercase monospace name.
9. Sentence case throughout. No ALL CAPS headings.

### Work order

Do these in sequence. Stop after each and show a preview.

1. **De-template.** `astro-paper.config.ts` is still 100% AstroPaper defaults. Replace
   `site.url` (currently `https://astro-paper.pages.dev/`), `site.title`, `site.description`,
   `site.author` (currently `Sat Naing`), `site.profile`, `site.timezone` (currently
   `Asia/Bangkok` → `Europe/Warsaw`). Replace all four `socials` placeholders and the
   `features.editPost.url`. Replace favicon and default OG image. Delete the 13 demo posts in
   `src/content/posts/` — read them first, they document configuration.
2. **Tokens.** Replace AstroPaper's palette custom properties with the table above. Set light as
   default. Verify the toggle still works.
3. **Typography.** Choose and self-host the sans and mono. Set the type scale; body ≥18px,
   measure 65–75ch.
4. **Header + wordmark.** Vermilion bar, mono lowercase name, mono nav, search icon.
5. **Homepage.** Hero blurb (max 46ch), `recent` section with hairline rule and count,
   date-column post list, packed tag grid, hairline footer.
6. **Post page.** Reading layout. **Not designed yet — propose two options before building.**
7. **Index pages.** Post list, tag index, tag detail, About, search results. Same date-column
   pattern.
8. **Responsive.** 360 / 768 / 1280. The fixed date column must collapse below ~480px —
   **propose how before implementing.**
9. **A11y + focus states.** **Not designed yet.** Keyboard path through nav, search, tag links.

### Quality gate before shipping

- Lighthouse ≥95 across performance, a11y, best practices, SEO
- WCAG AA contrast on **both** palettes — check `#98917F` on `#F4F0E7` specifically, it is the
  riskiest pair
- `/rss.xml`, `/sitemap-index.xml`, `/robots.txt` all resolve
- OG preview renders in a link debugger
- No sample content left anywhere

---

## Working agreements

- Branch before design work. Don't restyle on `main`.
- Propose before building anything marked "not designed yet". Don't improvise it from the
  homepage.
- If a design rule fights the content, say so rather than working around it silently.
- Before deleting, overwriting or renaming an existing file, show the change and wait for
  confirmation.

---

## Open decisions

These are unresolved. Don't assume an answer.

- **Domain.** `pawelhalas.com` is the recommendation, not yet purchased. Site title stays
  separate from domain.
- **PL/EN weighting.** Depends on whether the job search is Poland-only or Europe/remote.
  Unresolved.
- **`lang` frontmatter field.** Needs a schema change before any Polish post ships.
- **Analytics.** GoatCounter under evaluation; data retention needs verifying. Cloudflare's
  30-day window was ruled out as insufficient.
- **Case study template.** No AstroPaper precedent. Undesigned.
