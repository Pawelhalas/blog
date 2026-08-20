---
paths:
  - "src/**/*.astro"
  - "src/**/*.css"
  - "src/styles/**/*"
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
13. **Share options are one list; share *presentation* is per-context.** Added 2026-08-19 after a
    correction. Every surface must offer exactly the same ways to share — that list lives in
    `shareLinks` in `astro-paper.config.ts`, and `src/utils/getShareTargets.ts` builds the URLs, so
    both surfaces emit byte-identical links. How those options are *presented* is free to differ:
    `/posts` rows use a dropdown because a list row has no width for four controls; the post page
    uses an inline icon row because it does. Copy-link is not a URL and cannot live in the config,
    so `CopyLinkButton.astro` renders it alongside, in both places.
    **Do not "unify" the two presentations into one component.** That was tried and reverted —
    aligning the options is the requirement, aligning the interaction is not.

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

