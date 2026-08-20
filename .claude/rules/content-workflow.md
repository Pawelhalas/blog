---
paths:
  - "src/content/**/*.md"
  - "src/content.config.ts"
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

A `?` (or other URL-unsafe character) in the filename breaks the content loader outright — Astro
truncates at the `?` and fails with `ENOENT`. Keep filenames ASCII, lowercase, hyphens only.

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

### Typora quirks

- **Frontmatter escaping.** Typora sometimes writes `\---` instead of `---` around frontmatter,
  which fails YAML parsing and the post fails schema validation. Check the frontmatter delimiters
  after every edit made in Typora.
- **Dragged-in images can get absolute local paths.** `astro check` does not catch this — Astro
  treats an absolute path as an external URL and passes it through, so the build reports 0 errors
  while shipping a dead image. Image paths in post bodies must start with `../../assets/`, same
  constraint as the hero image above.

---

