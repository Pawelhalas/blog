---
title: Nowa automatyzacja, nowy problem
description: Czy ja na pewno wiem co robię?
---

To jest draft posta. Ten post będzie o tym, jak poprawiłem flow pracy nad blogiem. 



## [draft] The problem I thought I had

I'm building a personal blog. The work splits in two:

- **Thinking** — what to write, who for, how the site should look. I do this in Claude Cowork.
- **Building** — actually changing the site. I do this in Claude Code.

Two tools, two folders, one project. It felt scattered. Decisions I made while building never
made it back into my planning docs. Strategy I wrote while thinking never reached the tool
doing the building.

So I wrote a prompt asking for the perfect workflow to connect them.

## What I did instead of sending it

I asked for the prompt to be **reviewed** before it was answered.

That turned out to be the highest-leverage decision of the session, because the review found
the prompt was asking the wrong question. It asked for an essay about workflows in general —
"what's the consensus view, what's contested, what are 3–5 approaches." Generic advice, of the
kind you could get without knowing anything about me.

The rewrite changed one thing that mattered: **stop theorising, go read my actual files.**

> Both folders are connected to this session. Read them before answering — the current state
> of the split is visible on disk, don't infer it from what I've written here.

Same question. Completely different answer.

## What the files actually said

The diagnosis contradicted my own description of the problem.

I wasn't split across two environments. **One had already won** — I'd been drifting toward
keeping everything in the code repo for weeks without deciding to. My "planning folder" was a
museum: a README describing three files, two of which had moved and one of which was empty.
Untouched for fifteen days while twenty-one batches of work shipped on the other side.

The real problems were ones I hadn't noticed:

1. **My private planning docs existed in exactly one place.** No backup, no history. If the
   laptop died, they died.
2. **My main instruction file had grown to 404 lines.** Anthropic's own documentation says to
   target under 200, because longer files get followed *less* reliably.[^1]
3. **The worst one:** a stale copy of my design specification was sitting one folder too high in
   my file tree, loading into every single session, contradicting the live version.

That third one is the story.