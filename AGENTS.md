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

Scripts in `src/scripts/` need `export {}` at the top. Without it, TypeScript treats the file as
a global script, so two files declaring identically named top-level symbols collide and
`astro check` fails. See the comment in `noise.ts`.

When verifying image rendering (hero images, OG images), build first and preview `dist/` — the
dev server's `/_image` endpoint does not render, so a screenshot taken against `astro dev` can
show a broken image even when the build is fine.

Astro docs: https://docs.astro.build — consult the
[routing](https://docs.astro.build/en/guides/routing/),
[components](https://docs.astro.build/en/basics/astro-components/),
[content collections](https://docs.astro.build/en/guides/content-collections/) and
[styling](https://docs.astro.build/en/guides/styling/) guides before related work.

---

## Working agreements

- Branch before design work. Don't restyle on `main`.
- Propose before building anything marked "not designed yet". Don't improvise it from the
  homepage.
- If a design rule fights the content, say so rather than working around it silently.
- Before deleting, overwriting or renaming an existing file, show the change and wait for
  confirmation.
- Open decisions and backlog live in docs/open-decisions.md (private repo).

---

