import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { askStructured } from "./lib/claude.mjs";
import { git, mainRef, postsAt, releaseCandidates } from "./lib/git.mjs";
import { buildPrompt, generateImage } from "./lib/image.mjs";
import {
  applyCorrections,
  loadAllowlist,
  verifyCorrections,
} from "./lib/orthography.mjs";
import {
  ASSETS_DIR,
  assertNoTyporaEscape,
  buildFrontmatter,
  heroImageMarkdown,
  isPublishedPost,
  POSTS_DIR,
  slugOf,
  splitFrontmatter,
  stripFeatured,
  withHeroImage,
} from "./lib/posts.mjs";
import {
  BACKGROUNDS,
  nextBackground,
  readLog,
  recentBackgrounds,
} from "./lib/release-log.mjs";

/**
 * The per-post release pipeline.
 *
 * Removing the underscore on a `release/**` branch is the publish signal. From
 * there everything mechanical happens here, and merging the pull request is the
 * only human step.
 *
 * DRY_RUN computes the whole thing and writes nothing — that is how this is
 * meant to be run first, against a real post, to see what it would have done.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Scratch dir for dry-run output. Never committed; see the DRY_RUN branch. */
const PREVIEW_DIR = "dry-run-preview";

/**
 * Generated metadata is cached per branch, alongside the hero image.
 *
 * Without this the pipeline re-derived the description and tags on every push,
 * and the model answers differently each time - so what you read in a rehearsal
 * was not what landed in the pull request. Exactly the failure that put an
 * unapproved illustration on the blog, which #38 fixed for the picture only.
 *
 * Two different scopes, deliberately:
 *
 *   metadata    keyed to the BRANCH. It describes the post as a whole and you
 *               have already read it, so a typo fix must not silently rewrite
 *               it. If the body moved since it was generated, the report says
 *               so and [remeta] regenerates on demand.
 *
 *   orthography keyed to the CONTENT. Its findings point at particular words,
 *               so they have to track the current text; regenerating is both
 *               correct and the cheaper of the two calls.
 */
const CACHE_PATH = `${PREVIEW_DIR}/generated.json`;

const contentKey = (title, body) =>
  createHash("sha256").update(`${title}\n${body}`).digest("hex").slice(0, 16);

function readCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(entry) {
  mkdirSync(PREVIEW_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, `${JSON.stringify(entry, null, 2)}\n`);
}

/**
 * A workflow_dispatch input wins over the workflow's default; an empty string
 * means the event carried no input. Resolved here rather than in a GitHub
 * expression, where `inputs.dry_run || 'true'` treats an explicit `false` as
 * absent and forces the dry run back on.
 */
const setting = (input, fallback) =>
  (process.env[input] || process.env[fallback] || "").trim();

const DRY_RUN = setting("DRY_RUN_INPUT", "DRY_RUN_DEFAULT") !== "false";
const GENERATE_IMAGE = setting("GENERATE_IMAGE_INPUT", "") !== "false";
/**
 * Escape hatches, read from the commit SUBJECT line only.
 *
 * Matching the whole message meant a commit that merely mentioned a marker
 * fired it — which happened for real: a commit explaining what the markers do
 * triggered one. The subject line is where an instruction belongs; the body is
 * where you write about it.
 */
const SUBJECT = (process.env.COMMIT_MESSAGE || "").split("\n")[0];
const REIMAGE = /\[reimage\]/i.test(SUBJECT);
const REMETA = /\[remeta\]/i.test(SUBJECT);
const APPLY_ORTHOGRAPHY = process.env.APPLY_ORTHOGRAPHY === "true";
const IMAGE_QUALITY = process.env.IMAGE_QUALITY || "medium";
const BRANCH =
  process.env.GITHUB_REF_NAME ||
  git("rev-parse", "--abbrev-ref", "HEAD").trim();

const say = line => process.stdout.write(`${line}\n`);

function summary(markdown) {
  say(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

function fail(message) {
  summary(`## Release failed\n\n${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

/**
 * The tag rules live in `.claude/rules/content-workflow.md` and are read from
 * there at run time. Copying them into a prompt would create a second source of
 * truth that drifts silently — which is exactly the bug the rules file was
 * split out to fix.
 */
function tagRules() {
  const rules = readFileSync(".claude/rules/content-workflow.md", "utf8");
  const section = rules.match(/### Tag vocabulary\n([\s\S]*?)(?=\n### )/);
  if (!section)
    fail(
      "could not find the '### Tag vocabulary' section in .claude/rules/content-workflow.md"
    );
  return section[1].trim();
}

function tagInventory(ref) {
  const counts = new Map();
  for (const path of postsAt(ref).filter(isPublishedPost)) {
    const { data } = splitFrontmatter(git("show", `${ref}:${path}`));
    for (const tag of data?.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => `- ${tag} (${n} post${n === 1 ? "" : "s"})`)
    .join("\n");
}

/**
 * Schema-enforced so the transport cannot fail on the content. See the note in
 * lib/claude.mjs: Polish typographic quotes inside `tagReasoning` broke raw
 * JSON parsing on the first real post.
 */
const MetadataSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()),
  newTags: z.array(z.object({ tag: z.string(), closest: z.string() })),
  tagReasoning: z.string(),
  imageSubject: z.string(),
  imageAlt: z.string(),
});

async function describeAndTag({ title, body, rules, inventory }) {
  const meta = await askStructured({
    schema: MetadataSchema,
    system:
      "You prepare frontmatter for a personal blog written by Pawel Halas, a product owner in Wrocław. " +
      "Posts are written in Polish or English, never both — always answer in the language the post itself is written in. " +
      "You never rewrite the author's copy. You only produce metadata about it.",
    prompt: [
      "Here is a finished blog post. Produce its metadata.",
      "",
      "## The post",
      "",
      `Title: ${title}`,
      "",
      body,
      "",
      "## Tag rules (authoritative)",
      "",
      rules,
      "",
      "## Tags already in use on this blog",
      "",
      inventory || "(none yet)",
      "",
      "## What to return",
      "",
      "- `description` — 160 characters or fewer. A sentence, not a label; it is both the SEO meta description and the text on the generated OG image. Same language as the post.",
      "- `tags` — an array of 2 or 3 tags obeying the rules above. Prefer reusing a tag from the inventory.",
      '- `newTags` — an array naming any tag you invented that is not in the inventory, each with the closest existing tag: `[{"tag": "...", "closest": "..."}]`. Empty array if you reused everything.',
      "- `tagReasoning` — one sentence explaining the tag choice.",
      "- `imageSubject` — the single most concrete image in the post, as a short visual description in English for an illustrator. A thing that can be drawn, not a concept. Describe only the subject: no style, no background, no colour.",
      "- `imageAlt` — alt text for that illustration, in the language of the post. It describes the picture, not the post — it is reused as the thumbnail alt text on /posts.",
    ].join("\n"),
  });

  if (!meta.description || meta.tags.length === 0) {
    fail(
      `metadata came back without a description or tags:\n${JSON.stringify(meta, null, 2)}`
    );
  }
  if (meta.description.length > 160) {
    fail(
      `description is ${meta.description.length} characters, over the 160 limit:\n${meta.description}`
    );
  }
  return meta;
}

/**
 * A list of corrections, never the post itself. The model cannot rewrite prose
 * it is never asked to reproduce — see the note in lib/orthography.mjs.
 */
const CorrectionsSchema = z.object({
  corrections: z.array(
    z.object({
      before: z.string(),
      after: z.string(),
      reason: z.string(),
    })
  ),
});

async function orthography(body) {
  const { corrections } = await askStructured({
    schema: CorrectionsSchema,
    system:
      "You are a proofreader for Polish and English text. You find orthography errors only: " +
      "misspellings, missing or wrong diacritics, and obvious typos. You do not comment on " +
      "style, word choice, grammar, punctuation or structure, and you never suggest rewording. " +
      "If the text has no orthography errors you return an empty list, which is a normal and " +
      "expected answer.",
    prompt: [
      "Find the orthography errors in the text below.",
      "",
      "Return one entry per misspelled word:",
      "",
      "- `before` — the word exactly as it appears in the text, one word, no surrounding punctuation.",
      "- `after` — the correctly spelled word, one word.",
      '- `reason` — a few words on what is wrong, in the language of the text (e.g. "brak ogonka").',
      "",
      "Rules:",
      "",
      "- One whole word in, one whole word out. Never a phrase, never a sentence.",
      "- Only real orthography errors. A word spelled correctly is not an entry, even if you would have chosen a different word.",
      "- Ignore code, URLs, file paths and markdown syntax.",
      "- Ignore proper nouns and product names (Anthropic, Amodei, Minab, Claude Code, ...).",
      "- Do not reproduce the text. Only the list.",
      "",
      "---",
      "",
      body,
    ].join("\n"),
    maxTokens: 8000,
  });

  return verifyCorrections(
    body,
    corrections,
    loadAllowlist(resolve(HERE, "term-allowlist.txt"))
  );
}

/**
 * Reimage mode. "Image is valid but wrong" is a different failure from "post is
 * not ready": the frontmatter is already settled and re-deriving it would churn
 * a diff Pawel has already read. So only the image brief is recomputed.
 */
const ImageBriefSchema = z.object({
  imageSubject: z.string(),
  imageAlt: z.string(),
});

async function imageBrief({ title, body }) {
  const meta = await askStructured({
    schema: ImageBriefSchema,
    system:
      "You brief an illustrator for a personal blog. You describe what to draw. " +
      "You never comment on the writing.",
    prompt: [
      "Here is a published blog post whose illustration missed. Brief a different one.",
      "",
      `Title: ${title}`,
      "",
      body,
      "",
      "Provide:",
      "",
      "- `imageSubject` — the single most concrete image in the post, as a short visual description in English. A thing that can be drawn, not a concept. Subject only: no style, no background, no colour. Pick a different angle from the obvious one.",
      "- `imageAlt` — alt text for that illustration, in the language of the post. It describes the picture, not the post.",
    ].join("\n"),
  });

  if (!meta.imageSubject || !meta.imageAlt) {
    fail(`image brief came back incomplete:\n${JSON.stringify(meta, null, 2)}`);
  }
  return meta;
}

const HERO_IN_BODY =
  /!\[([^\]]*)\]\(\s*<?(\.\.\/\.\.\/assets\/images\/[^)>\s]+)>?\s*\)/;

async function main() {
  const base = mainRef();
  let candidates = releaseCandidates("HEAD", base);

  // Reimaging a post that is already published finds no candidate, because the
  // post is on main by then - which made [reimage] stop working at exactly the
  // moment you most want it: after seeing the image live. The branch name is
  // the fallback, since release/<slug> is the convention the trigger already
  // relies on.
  if (candidates.length === 0 && REIMAGE) {
    const fromBranch = `${POSTS_DIR}/${BRANCH.replace(/^release\//, "")}.md`;
    if (existsSync(fromBranch)) {
      candidates = [fromBranch];
      say(
        `Reimage: no new post on this branch, using ${fromBranch} from the branch name.`
      );
    }
  }

  if (candidates.length !== 1) {
    fail(
      candidates.length === 0
        ? `No post to publish. Branch \`${BRANCH}\` adds no un-prefixed file under \`src/content/posts/\` that is not already on main. Did you forget to drop the leading underscore?`
        : `Expected exactly one post, found ${candidates.length}:\n\n${candidates.map(p => `- \`${p}\``).join("\n")}\n\nOne branch, one post. Split these into separate branches.`
    );
  }

  const path = candidates[0];
  const slug = slugOf(path);

  // MDX entries expose no `body` (src/utils/getHeroImage.ts returns early), so
  // an .mdx post can never get a hero image or a /posts thumbnail. Refusing is
  // the only honest option — the alternative publishes a post that is silently
  // broken in two places.
  if (path.endsWith(".mdx")) {
    fail(
      `\`${path}\` is MDX. MDX entries expose no \`body\`, so \`getHeroImage.ts\` can never find a hero ` +
        `image and the post would ship with no thumbnail on /posts and no OG image. Rename it to \`.md\`.`
    );
  }

  const original = readFileSync(path, "utf8");
  assertNoTyporaEscape(original, path);
  const { data, body } = splitFrontmatter(original);

  const title = data?.title;
  if (!title) {
    fail(
      `\`${path}\` has no \`title\` in its frontmatter. A draft carries \`title\` and body only — ` +
        `everything else is this pipeline's job, but the title is yours.`
    );
  }

  const existingHero = body.match(HERO_IN_BODY);
  const reimage = REIMAGE && Boolean(data.description) && Boolean(existingHero);
  say(reimage ? `Reimaging: ${path}` : `Publishing: ${path}`);

  const log = readLog();

  const key = contentKey(title, body);
  const cache = reimage || REMETA ? null : readCache();

  let metaReused = false;
  let contentMovedSince = false;
  let meta;

  if (reimage) {
    meta = await imageBrief({ title, body });
  } else if (cache?.meta) {
    meta = cache.meta;
    metaReused = true;
    contentMovedSince = cache.key !== key;
    say(
      contentMovedSince
        ? "Reusing the metadata you already reviewed — but the post has changed since."
        : "Reusing the metadata generated earlier on this branch."
    );
  } else {
    meta = await describeAndTag({
      title,
      body,
      rules: tagRules(),
      inventory: tagInventory(base),
    });
  }

  // Orthography follows the text, not the branch: its findings name particular
  // words, so a changed body has to be re-read.
  let language = null;
  if (!reimage) {
    if (cache?.language && cache.key === key) {
      language = cache.language;
      say("Reusing the orthography findings for this text.");
    } else {
      language = await orthography(body);
    }
  }

  if (!reimage) writeCache({ key, meta, language });

  // Exactly one post is featured at a time. index.astro splits the homepage
  // into featuredPosts and recentPosts, so featuring everything empties the
  // recent section and partitions nothing.
  const unfeature = [];
  if (!reimage) {
    for (const other of postsAt("HEAD").filter(isPublishedPost)) {
      if (other === path) continue;
      const text = readFileSync(other, "utf8");
      const stripped = stripFeatured(text);
      if (stripped.changed)
        unfeature.push({ path: other, text: stripped.text });
    }
  }

  // Reimaging reuses the filename and therefore the background: the rotation
  // is about consecutive posts looking different, and this is still one post.
  const existingFile = reimage ? existingHero[2].replace(/^.*\//, "") : null;
  const background = reimage
    ? (BACKGROUNDS.find(colour =>
        existingFile
          .replace(/\.[a-z0-9]+$/i, "")
          .endsWith(`-${colour.split(" ").at(-1)}`)
      ) ?? nextBackground(log))
    : nextBackground(log);
  const imageFile =
    existingFile ?? `${slug}-${background.split(" ").at(-1)}.png`;
  let image = null;
  let imageError = null;
  let imageReused = false;

  // An image already previewed for this branch is reused rather than redrawn.
  // gpt-image-1 is non-deterministic, so regenerating produced a different
  // picture from the one reviewed - which made the dry-run preview worse than
  // no preview, because it looked like a checkpoint and was not one. Reimaging
  // deliberately skips this: a fresh picture is the whole point.
  const previewPath = `${PREVIEW_DIR}/${imageFile}`;
  if (!reimage && GENERATE_IMAGE && existsSync(previewPath)) {
    image = readFileSync(previewPath);
    imageReused = true;
    say(`Reusing the previewed hero image from ${previewPath}.`);
  }

  if (image) {
    // already have it
  } else if (!GENERATE_IMAGE) {
    imageError =
      "image generation disabled for this run (GENERATE_IMAGE=false)";
  } else if (!process.env.OPENAI_API_KEY) {
    imageError = "OPENAI_API_KEY is not set";
  } else {
    const prompt = buildPrompt({
      stylePath: resolve(HERE, "image-style.md"),
      subject: meta.imageSubject,
      background,
    });
    say(`Generating hero image (${IMAGE_QUALITY}, ${background})...`);
    ({ image, error: imageError } = await generateImage(prompt, IMAGE_QUALITY));
  }

  // Reimaging leaves the frontmatter byte-for-byte alone. It is already settled
  // and already reviewed; re-deriving it would churn a diff Pawel has read.
  const pubDatetime = `${new Date().toISOString().slice(0, 19)}Z`;
  const frontmatter = reimage
    ? original.slice(0, original.length - body.length)
    : buildFrontmatter({
        title,
        description: meta.description,
        pubDatetime,
        tags: meta.tags,
        featured: true,
      });

  // Off by default: the flow has Pawel applying or ignoring the findings while
  // he reads the diff. Turning it on applies only the findings that survived
  // the guard — never the model's text wholesale.
  const proofread =
    APPLY_ORTHOGRAPHY && language?.accepted.length
      ? applyCorrections(body, language.accepted)
      : body;

  let finalBody = proofread;
  if (image) {
    const markdown = heroImageMarkdown(meta.imageAlt, imageFile);
    // Replaced via a function so a `$` in the alt text is not read as a
    // replacement pattern.
    finalBody = reimage
      ? proofread.replace(HERO_IN_BODY, () => markdown)
      : withHeroImage(proofread, markdown);
  }
  const rebuilt = frontmatter + finalBody;

  // ---- report -------------------------------------------------------------

  const imageSection = [
    "### Hero image",
    "",
    image
      ? `${imageReused ? "**Reused the image you already reviewed** on an earlier run of this branch" : `Generated at 1536×1024 (${IMAGE_QUALITY} quality)`}, background **${background}**` +
        (reimage
          ? " — unchanged, this is the same post."
          : ` — previous two were ${recentBackgrounds(log).join(", ") || "none"}.`) +
        `\n\nSaved to \`${ASSETS_DIR}/${imageFile}\`${reimage ? ", replacing the previous one" : " and inserted as the first body image"}.\n\n` +
        `**Subject:** ${meta.imageSubject}\n\n**Alt:** ${meta.imageAlt}`
      : `⚠️ **No image.** ${imageError}\n\nThe post is otherwise complete. Add an image by hand, or push an empty commit containing \`[reimage]\` to retry only this step.`,
  ];

  const report = (
    reimage
      ? [
          `## Reimage: ${title}`,
          "",
          `\`${path}\` — frontmatter and copy untouched, hero image regenerated.`,
          "",
          ...imageSection,
        ]
      : [
          `## Publish: ${title}`,
          "",
          `\`${path}\` → \`/posts/${slug}\``,
          "",
          "### Frontmatter written",
          "",
          "```yaml",
          frontmatter.replace(/^---\n|---\n$/g, "").trim(),
          "```",
          "",
          metaReused
            ? contentMovedSince
              ? "> ⚠️ **The post changed after this metadata was generated.** The description and tags below are the ones you already reviewed, reused deliberately so a typo fix cannot silently rewrite them. If the edit was substantial, push an empty commit containing `[remeta]` to regenerate."
              : "_Description and tags reused from the earlier run on this branch — what you reviewed is what ships._"
            : "",
          "",
          `**Tags** — ${meta.tagReasoning ?? "no reasoning given"}`,
          meta.newTags?.length
            ? `\n> ⚠️ New tag(s) minted: ${meta.newTags.map(t => `\`${t.tag}\` (closest existing: \`${t.closest}\`)`).join(", ")}. A tag earns its place at roughly three posts — check this one is worth a public URL.`
            : "\nAll tags reused from the existing vocabulary.",
          "",
          `**Description** — ${meta.description.length}/160 characters.`,
          "",
          "### Featured",
          "",
          unfeature.length
            ? `\`featured: true\` set here; stripped from ${unfeature.map(u => `\`${u.path}\``).join(", ")}.`
            : "`featured: true` set here. No other post was featured.",
          "",
          ...imageSection,
          "",
          "### Orthography",
          "",
          language.accepted.length
            ? `${language.accepted.length} finding(s). ${APPLY_ORTHOGRAPHY ? "Applied." : "**Not applied** \u2014 apply the ones you agree with while reviewing the diff."}\n\n` +
              "| \u00b6 | Written | Suggested | Why |\n|---|---|---|---|\n" +
              language.accepted
                .map(
                  f =>
                    `| ${f.paragraph} | \`${f.before}\` | \`${f.after}\` | ${f.reason}${f.occurrences > 1 ? ` (\u00d7${f.occurrences})` : ""} |`
                )
                .join("\n")
            : "No orthography findings.",
          language.rejected.length
            ? `\n${language.rejected.length} suggestion(s) dropped by the guard: ${language.rejected.map(r => `\`${r.before}\` \u2192 \`${r.after}\` (${r.why})`).join(", ")}.`
            : "",
        ]
  ).join("\n");

  summary(report);

  if (DRY_RUN) {
    // The image was generated and paid for, so don't bin it. On a real run it
    // gets committed and shows up rendered in the PR's Files changed tab; a dry
    // run writes nothing, which left the one genuinely subjective thing the
    // pipeline produces invisible at exactly the moment you want to judge it.
    //
    // PREVIEW_DIR sits outside src/assets/ and the commit step adds only
    // explicit paths, so a preview cannot drift into a commit. It also never
    // exists on a real run.
    if (image) {
      mkdirSync(PREVIEW_DIR, { recursive: true });
      writeFileSync(`${PREVIEW_DIR}/${imageFile}`, image);
      summary(
        `\nHero image written to \`${PREVIEW_DIR}/${imageFile}\` and uploaded as the ` +
          "**hero-image-preview** artifact on this run — download it from the Artifacts " +
          "box at the bottom of this page to see what it actually drew."
      );
    }
    summary(
      "\n---\n\n**Dry run — nothing was written, committed, or pushed.**"
    );
    say("\n=== intended file content ===\n");
    say(rebuilt);
    return;
  }

  // ---- write --------------------------------------------------------------

  writeFileSync(path, rebuilt);
  for (const other of unfeature) writeFileSync(other.path, other.text);
  if (image) writeFileSync(`${ASSETS_DIR}/${imageFile}`, image);

  git("config", "user.name", "github-actions[bot]");
  git(
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com"
  );
  git("add", "-A", "--", path, ASSETS_DIR, ...unfeature.map(u => u.path));

  if (git("diff", "--cached", "--name-only").trim() === "") {
    summary("\nNothing changed — no commit, no pull request.");
    return;
  }

  git(
    "commit",
    "-m",
    reimage
      ? `Regenerate the hero image for ${slug}`
      : `Prepare ${slug} for publishing\n\nFrontmatter, hero image and featured flag set by release.yml.`
  );
  // Pushed with the default token, whose pushes do not start workflow runs —
  // this cannot retrigger release.yml. The PR step uses the PAT precisely
  // because there the retrigger (of ci.yml) is the point.
  git("push", "origin", `HEAD:${BRANCH}`);

  writeFileSync(
    "pr-body.md",
    `${report}\n\n---\n\nOpened by \`release.yml\`. Merging is the only human step — Cloudflare deploys on merge.\n`
  );
  writeFileSync("pr-title.txt", `${reimage ? "Reimage" : "Publish"}: ${title}`);
  writeFileSync("pr-labels.txt", image ? "" : "needs-image");
  say("\nWrote pr-title.txt, pr-body.md and pr-labels.txt for the PR step.");
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
