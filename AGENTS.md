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

### Tag vocabulary

Agreed 2026-08-13. Tags are navigation, not labels — every tag is a public URL and a page that
has to justify existing.

1. **Lowercase, except proper nouns and acronyms.** `etyka`, `projekty` — but `AI`, `Anthropic`,
   `Claude Code`. Display casing is free: `getUniqueTags` keeps `tagName` for display and derives
   `tag` for the URL separately, so casing never affects the slug.
2. **Spaces, never underscores.** `slugifyStr` turns spaces into hyphens but passes `_` through
   untouched, so `mniej_szumu` produced `/tags/mniej_szumu/` while every other tag used hyphens.
3. **Nouns, not phrases.** A tag is a bucket.
4. **No tag that applies to every post.** A tag on everything partitions nothing — this is why the
   site-name tag was dropped.
5. **Polish by default; English only where it is genuinely the term of art** (`product management`
   stays English because that is what Polish PMs say; `etyka` does not become "ethics").
6. **2–3 tags per post, and prefer reusing an existing tag over minting a new one.** A tag earns
   its place at roughly three posts. This one is the difference between the tag grid becoming the
   dense block the design spec wants and staying a wall of dead ends.

Renaming a published tag breaks its URL, so settle a tag before it ships rather than after.

### Hero image

Agreed 2026-08-19. **Every post opens with an image, and that image is its thumbnail on
`/posts`.** Nothing in the frontmatter declares it — `src/utils/getHeroImage.ts` reads the first
markdown image out of the post body, so the image is written once and used twice.

This is a convention the author has to keep, not something the build enforces. A post with no
image, or one that opens with prose, silently gets no thumbnail. Pawel's plan is for the release
automation to guarantee a hero image per post; until that exists, it is a manual habit. If it
stops holding, switch to an explicit `ogImage` frontmatter field rather than loosening the
extraction.

Two constraints the extractor imposes:

- **The image must live under `src/assets/`** and be referenced relatively (`../../assets/...`).
  Remote URLs are skipped deliberately — they cannot be optimised at build time.
- **Alt text becomes the thumbnail's alt text.** It is already required for the in-post image;
  it now does double duty, so it should describe the picture, not the post.

### Scheduled posts

A `pubDatetime` in the future hides the post until that time — but Cloudflare only rebuilds on
push, so a future-dated post will not appear on its own. Either publish with a past/current
datetime, or push again after the date passes.

---

## Design spec — "Shōtengai"

### Direction

Muji supplies the system: restraint, function-first typography. Shimokitazawa / Akasaka / Nakano
supply the materials: warm paper tones, faded signage colour, small densely-set labels, worn
rather than polished.

Explicitly **not** neon, cyberpunk, synthwave, or glow effects.

**Amended 2026-08-13.** The direction used to read "no ornament". It now allows exactly one
ornament — the distorted wordmark (rule 8) — and nothing else. The page is quiet so that the
wordmark is not; a second ornament anywhere would spend what makes the first one work. Treat
"no ornament" as still binding everywhere except that one object.

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

**Text muted is decorative-only, verified 2026-08-05.** `#98917F` on `#F4F0E7` measures 2.76:1;
`#625B51` on `#14120F` measures 2.79:1. Both fail WCAG AA even at the relaxed 3:1 threshold for
large text/UI components. Keep the hex as spec'd (darkening it would collapse the distinction
from text secondary, which measures a clean 5.08:1), but never use `--text-muted` /
`--color-text-muted` for anything meant to be read — dividers, icon tints, watermark-style
flourishes only. Reach for text secondary for any real content.

### Rules

1. **Warm neutrals only.** No blue-grey, no pure `#000` or `#FFF`. Background is paper or ink.
2. **One accent, ~4 uses per page maximum** — RSS link, active tag, current nav item, and the
   three distortion bands in the wordmark (which count as one use, being one object). Never
   apply it to body links wholesale. Revised 2026-08-13: the 3px wordmark bar is gone, and the
   distortion took its slot.
3. **Structure from alignment and whitespace, with hairlines used sparingly.** No cards, no
   background fills, no shadows, no rounded chips, no border-radius above 2px. Revised
   2026-08-13: the horizontal rules were removed from the page body — section labels and the
   date column now carry the structure. Hairlines survive only as page chrome (header, footer)
   and in the tag lattice. Where a rule is used it is 0.5px.
4. **Two typefaces, two jobs.** Neutral sans for anything read as prose. Monospace strictly for
   machine data — dates, counts, tag labels, footer. **Never set body copy in monospace.**
5. **Dates in a fixed-width left column** on every index page. Format `DD·MM·YY`, middle dot
   separator.
6. **Metadata set small and tracked wide** — 10.5–11px, letter-spacing 0.03–0.16em. Reads like a
   printed ticket.
7. **Body copy ≥18px, measure 65–75ch, line-height ~1.6.** This is a reading site; it is the one
   rule that outranks aesthetics.
8. **Wordmark** = the site name in lowercase monospace, distorted. Rewritten 2026-08-13,
   replacing the 3px vermilion bar. Eight horizontal bands are clipped from the word and
   stacked over an undistorted copy; three of them carry the accent. Implementation and the
   reasoning behind every constant live in `src/styles/distortion.css`. Two states:
   - **Animated** (hero, default): all bands tear together on 8 beats per 8s cycle,
     displacement to 44px, with ±3px jitter between beats so the word is never still.
   - **Calm** (header mark always; hero when the reader switches the noise off; anyone whose
     OS requests reduced motion): the same worst frame of that cycle scaled to 13.5%, so bands
     shift 3.5–6px. Readable, visibly off-register, accent bands lit rather than flashing.

   The mark is the hero stopped, not a lookalike — same frame, same object. It runs at
   `--amp: .35` because it is a navigation control on every page rather than a statement.
   **Switching the noise off must always reduce it**, never intensify it: the site is called
   *less noise*.
9. Sentence case throughout. No ALL CAPS headings.
10. **Motion is opt-out and safety-bounded.** The 8s cycle is not a taste decision: at 4s the
    bursts fired twice a second, close to WCAG 2.3.1's three-flashes-per-second threshold. Any
    change to the timing has to keep bursts at or below one per second. `prefers-reduced-motion`
    must always resolve to a static state.
11. **No section subtitles.** Added 2026-08-19. The heading names the section; a one-line italic
    gloss under every one of them ("All the articles I've posted.") was filler. `Main.astro` still
    accepts `pageDesc` but renders it only when passed, and no page passes it. The `pages.*Desc`
    strings survive in `en.ts` unused — left there because the tag page composed its subtitle from
    one, so deleting them is a separate decision.
12. **Floating UI stays flat.** Added 2026-08-19 for the `/posts` share menu, and binding on
    anything similar that follows. Rule 3 forbids shadows, fills and radii above 2px, and a
    dropdown is not exempt: the panel is a paper-background surface on a 0.5px hairline with a 2px
    radius, no shadow. It also opens on **click, not hover** — hover-only would be unreachable by
    keyboard and awkward on touch. Hover may reveal a control; it may never be the only way to
    operate one.

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

**Distinctive hero — done 2026-08-13.** Was optional and undesigned; built after step 5 rather
than after step 9, because Pawel wanted it before the remaining index work. The 3px vermilion bar
is gone, replaced by the distorted wordmark described in rule 8. Rules 2, 3 and 8 were rewritten
to match, and rule 10 added. The corresponding backlog entry is closed.

### Quality gate before shipping

- Lighthouse ≥95 across performance, a11y, best practices, SEO
- WCAG AA contrast on **both** palettes — `#98917F`/`#625B51` (text muted) fail even the relaxed
  3:1 threshold; confirmed decorative-only, see the Tokens section above. Everything else used for
  real content should clear 4.5:1.
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
- **PL/EN weighting.** Resolved 2026-08-05 for the near term: the site is Polish. `site.lang`
  and Astro's `i18n.defaultLocale` are both `pl`, so pages render `<html lang="pl">` and Pagefind
  indexes with Polish stemming. Whether English content ever joins is still open and depends on
  whether the job search stays Poland-only.
  **Both settings must move together.** `Layout.astro` reads `Astro.currentLocale ?? site.lang`,
  and `Astro.currentLocale` comes from `astro.config.ts` — so changing `astro-paper.config.ts`
  alone silently does nothing.
- **UI chrome is still English.** `src/i18n/lang/` ships `en.ts` only; `useTranslations` falls
  back to English for any unknown locale, so nav, dates and footer read "Posts"/"Tags"/"About" on
  a Polish site. Fixing it means writing `pl.ts` — mechanical, but the wording is Pawel's call,
  not something to guess. **Not done yet.**
- **`lang` frontmatter field.** Only needed if PL and EN posts ever coexist. A single-language
  site does not need it; the site-wide setting above covers today's case.
- **Analytics.** GoatCounter under evaluation; data retention needs verifying. Cloudflare's
  30-day window was ruled out as insufficient.
- **Case study template.** No AstroPaper precedent. Undesigned.

---

## Backlog

Wanted, but not scheduled and not designed. Establish scope before building.

- **Automated post-release workflow.** Pawel flagged on 2026-08-12 that he wants the
  draft → publish path optimised and partly automated. **Scope and guardrails are explicitly
  undecided and must be agreed before any implementation** — his words. Candidates worth putting
  on the table when that conversation happens: frontmatter scaffolding and validation before
  commit, filename/permalink linting (ASCII-only, no diacritics), a pre-push `astro check` gate so
  a bad post fails locally rather than in the Cloudflare deploy, tag-vocabulary consistency, and
  scheduled publishing — which today does **not** work unattended, because Cloudflare only
  rebuilds on push, so a future `pubDatetime` needs a later push to appear.
  The guardrail question to settle first: how much the automation is allowed to do without a human
  reading the diff, given publishing is public and hard to retract.

- ~~**Posts list redesign.**~~ **Done 2026-08-19**, to Pawel's own specification rather than to a
  proposed design — he rejected both post-page options and supplied a list instead. `/posts` rows
  now carry a hero thumbnail, a whole-row click target and a share menu; section subtitles were
  removed site-wide.

  **The scope decision matters more than the build:** the rich row is `/posts` only. The homepage
  stays deliberately dense and thumbnail-free, and tag detail pages were left on the compact row.
  So the site now runs **two** list patterns where the spec asked for one — `Card.astro` takes a
  `layout` prop. That was a deliberate call, not drift. Anyone changing the list should know both
  patterns exist before "fixing" the inconsistency.

- **Featured article on the homepage.** Pawel flagged on 2026-08-19, while scoping the posts-list
  redesign — he wants a featured/pinned article treatment on the homepage, distinct from the dense
  recent-posts list underneath it. **Not designed yet — propose before building.** Two things to
  settle first: whether it uses the existing `featured` frontmatter boolean (which the schema
  already has and no post currently sets), and whether it may carry the hero image — the homepage
  was just deliberately kept thumbnail-free, so a featured block with an image is a considered
  exception to that, not a contradiction of it.

- ~~**Wordmark / main header redesign.**~~ **Done 2026-08-13.** Built as the distorted wordmark;
  see rule 8 and `src/styles/distortion.css`. Left here rather than deleted so the decision trail
  stays readable.
