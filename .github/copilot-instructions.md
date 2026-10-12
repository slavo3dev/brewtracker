# BrewTracker — Copilot instructions

BrewTracker is Reliant's field platform for coffee-machine service: an Expo app for drivers and techs, a Next.js admin app for managers and the CEO, and Supabase (Postgres, Auth, Storage, Edge Functions). `AGENTS.md` is the rule source. These instructions are how to review a pull request and how to change code. When `AGENTS.md` and the code disagree, trust the code and say so.

Review the diff only. Do not review the whole repository. Comment on what the diff introduces or weakens. A pre-existing issue in a file the diff touches is a note, not a reason to rewrite the file.

## Pull request review

Leave inline comments on the changed lines.

- **Blocker** — merge waits. Access control is missing or bypassed, a field gate is removed, a secret is committed, or money/inventory math silently accepts bad data.
- **Fix** — change it in this PR. The behavior is wrong or untested, and the safe repair is local.
- **Note** — does not block. Missing ticket id, STRETCH work mixed into an MVP ticket, or a doc/code mismatch.

Do not comment on ESLint or Prettier nits. Do not suggest switching npm, Next.js, Expo, Supabase, or Tailwind. Do not treat a stubbed STRETCH feature as a bug when it is marked deferred. Do not ask for renames or refactors outside the diff.

Epics: `FOUND`, `AUTH`, `ROUTE`, `FLOW`, `AI`, `TECH`, `INV`, `DASH`, `QA`. A missing ticket id in the title or body is a note. STRETCH work shipped inside an MVP ticket, without saying so, is a note.

Path-specific checks live in `.github/instructions/`. Apply every file whose `applyTo` matches the diff.

## When writing or fixing code

Repair blockers first, then local **fix** items. Leave product decisions and missing-ticket questions alone.

- Do not hand-edit `packages/types/src/database.ts`. It is generated. After a migration, regenerate types with `supabase gen types typescript`. Other files in `packages/types/src` are hand-written and may change.
- Par level, yield, FIFO, shrinkage, PPM, unit conversion, and geofence distance belong in pure functions, not in JSX. `normalizeInventoryQuantity` in `packages/types/src/inventory.ts` is the pattern.
- This repo has no test script. Flag a new or changed pure function that has no unit test. Do not add Jest, Vitest, or another runner unless the task asks for a test harness.
- No `any` without a comment that says why it is unavoidable.
- From the repo root, `npm install` if dependencies are missing, then `npm run typecheck` and `npm run lint`. Both must pass before the change is done.

## Stack

npm workspaces (`apps/*`, `packages/*`). Admin app: `apps/web` (Next.js App Router, TypeScript, Tailwind v4). Mobile: `apps/mobile` (Expo, Expo Router). Shared types: `@brewtracker/types`. Session refresh is `apps/web/proxy.ts`, which exports `proxy`. Do not add `middleware.ts`. `AGENTS.md` still says `apps/web/src/proxy.ts`; the file on disk is `apps/web/proxy.ts`.
