# Session 0 — Project Bootstrap

You are starting a new project. Your most important job right now is to create three foundational documents that will shape how all future work — yours and the user's — gets done: **CLAUDE.md**, **CHANGELOG.md**, and **PROGRESS.md**.

These documents must be specific to this project. Generic boilerplate is worse than nothing — it trains future sessions to ignore the docs entirely.

---

## Step 1: Gather what you need

Before writing anything, confirm you have clear answers to all of the following. If any are missing or vague, **ask the user before proceeding**. Getting this right is the whole point of session 0.

1. **Project name and description** — What does it do? What problem does it solve? What is it explicitly *not*?
2. **Tech stack** — Languages, frameworks, key libraries, runtime/environment
3. **Architecture** — How is the project structured? (pipeline, monolith, services, library, CLI, etc.) How do the main pieces relate?
4. **How correctness is verified** — How do you run tests? What's the oracle — the known-good reference that makes something "correct"? What does passing look like?
5. **Coding conventions** — Style rules, naming patterns, anything non-obvious or project-specific. Skip what's standard for the language.
6. **Key constraints or failure modes** — What would an AI agent (or new developer) get wrong without being told? What mistakes are easy to make here?
7. **Critical rules** — Anything that must never happen: breaking tests, committing in a certain state, skipping a validation step, etc.
8. **Current state** — New project or existing work? If existing: what's done, what's next, what's blocked?

Do not proceed to Step 2 until you have enough to write something real for every section. Ask follow-up questions if needed — this is worth the time.

---

## Step 2: Plan before writing

Once you have the information, show the user a brief outline of what you intend to write for each document. Keep it short — section headers and one sentence each. Ask if anything looks wrong before creating the files.

---

## Step 3: Create the documents

### CLAUDE.md

The behavioral contract for this project. Every AI session (and every developer) should be able to read this and know exactly how to work.

**Structure:**

**What is this?** — 2–4 sentences. What it does, what it is not, where to find deeper detail.

**Quick reference** — The commands needed to run, test, and build. Must be copy-pasteable with no prior context.

**Session orientation** — What to do at the start of every session:
- What to read first (always: PROGRESS.md)
- What to check (tests, build status, etc.)
- How to pick the next task
- What to do before stopping

**Principles** — The rules that matter most for *this* project. These should be earned and specific — derived from the actual tech stack, domain, and failure modes, not general best practices. Each principle must explain *why* it exists. Cover at minimum:
- How correctness is established (what is the oracle?)
- How to keep work small, verifiable, and reversible
- How to handle uncertainty or getting stuck (don't guess — verify)
- How to document for the next session (not for posterity)
- How to manage context (output hygiene, log files vs stdout, etc.)

**Architecture** — Enough to understand how pieces fit together. Not exhaustive. Link to other docs for depth.

**Conventions** — The non-obvious ones. Skip anything self-evident from the code or standard in the language/framework.

**Critical rules** — A short list of hard constraints. Each rule gets one line explaining why it exists. If there's no reason, it's not a rule.

**Tone:** Direct and dense. Write for an AI agent that needs fast orientation, not a human tutorial. Rules should be specific enough that following them literally would produce good work.

---

### CHANGELOG.md

A running technical record of what has been done, decided, and discovered. Not a commit log — this captures *why*, not just *what*.

**Structure:**

Start with a "Project initialized" entry dated today.

Each entry should include as relevant:
- What changed or was decided
- Root cause or motivation
- Alternatives considered and why they were rejected
- Measurable outcomes (benchmarks, error rates, test counts, etc.)
- Anything that would be useful context six months from now

**Format:** Most recent entry first. Date headers (`### YYYY-MM-DD: Title`). Subsections as needed.

---

### PROGRESS.md

The shared-memory document for multi-session AI-assisted work. This is what every new session reads *before doing anything else* to orient itself. It must be kept current — updated at the end of every meaningful work session. A stale PROGRESS.md is actively harmful.

**Structure:**

**Current status** — One short paragraph: where things stand right now, what was last worked on.

**What's done** — Checkboxes with completion dates. Be specific enough that "done" is unambiguous.

**What's next** — Prioritized. Top item should be immediately actionable.

**What's blocked** — Anything waiting on a decision, external dependency, or unresolved question.

**Failed approaches** — Things tried that didn't work, and why. This is critical: prevents re-attempting dead ends in future sessions.

**Notes for next session** — Anything useful that doesn't fit above.

**Tone:** Practical and current-state. Not a narrative. Update it or delete it — do not let it go stale.

---

## Step 4: Write the files

Create all three files in the project root. After writing, briefly summarize what you put in each one and flag anything you had to make assumptions about — those assumptions should be validated with the user before the project proceeds.
