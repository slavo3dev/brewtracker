# BrewTracker — Agent Instructions

These instructions guide GitHub Copilot (code review and coding agent) and any
other AI agent working in this repository. Read this file before reviewing or
writing any code here.

## What this project is

BrewTracker is a field operations platform for **Reliant**, a company that
services coffee machines. It covers route management, an 8-step on-site
service workflow, AI-assisted photo quality checks, parts/inventory tracking,
and a CEO-facing reporting dashboard. The end users are **drivers/techs** (on
the mobile app) and **managers/CEO** (on the admin web app).

- **Timeline**: 60-day build, 1–2 full-stack developers. Speed and scope
  discipline matter more than polish on STRETCH features.
- **Ticket tags**: every backlog ticket is `[MVP]` or `[STRETCH]`. When
  reviewing a PR, if it implements a STRETCH-tagged ticket before its
  dependent MVP tickets are done, flag that as a sequencing risk, not just a
  code issue.
- **Ticket IDs**: PRs should reference a ticket ID in the title or
  description, e.g. `[AUTH-4] Add geofence-gated clock-in`. Epics: `FOUND`,
  `AUTH`, `ROUTE`, `FLOW`, `AI`, `TECH`, `INV`, `DASH`, `QA`. Flag PRs with no
  ticket reference so they can be triaged.

## Tech stack (do not suggest swapping any of these)

- **Monorepo**: npm workspaces (`apps/*`, `packages/*`). Not Yarn, not pnpm —
  this was deliberately decided. Don't suggest switching package managers.
- **Admin web app** — `apps/web`: Next.js (App Router), TypeScript, Tailwind
  v4, deployed to Vercel.
- **Mobile app** — `apps/mobile`: Expo (React Native), TypeScript, Expo
  Router.
- **Backend**: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions).
  Row-Level Security is the access-control model — there is no separate
  authorization layer to maintain.
- **Shared types** — `packages/types`: generated via
  `supabase gen types typescript`, imported as `@brewtracker/types` by both
  apps. Never hand-edit generated type files; regenerate them after schema
  migrations instead.
- **Offline-first sync** (mobile only): local SQLite mirror, write-queue
  architecture, background sync worker. Any mutation made in the field (photo,
  meter reading, clock event) must write locally first and queue for sync —
  never assume the network is available.

## Architecture rules to enforce in review

1. **RLS is default-deny.** Every new table must ship with explicit
   Row-Level Security policies in the same PR as the schema migration. A
   table with RLS disabled, or enabled with no policies, should be blocked.
2. **Role model**: `driver`, `tech`, `manager`, `ceo`. A driver may only see
   their own routes/stops/time entries. A manager sees their assigned
   region. A CEO sees everything. Flag any query or API route that doesn't
   visibly respect this scoping (either via RLS or an equivalent explicit
   check).
3. **Geofencing is a hard gate, not a soft hint.** Clock-in/out and
   "arrive at stop" actions are gated on GPS matching a stored
   lat/lng/radius, with a manual-override path that requires a logged
   reason. Don't let a PR silently remove the override-reason requirement.
4. **The 8-step service workflow is an enforced sequence.** A driver cannot
   skip ahead (e.g. submit a meter reading before the QR scan step
   resolves a machine). State for this flow must persist locally so a
   killed/backgrounded app resumes mid-flow rather than losing progress.
5. **Photos and signatures are mandatory at the steps where they're
   specified**, queued for upload, never blocking the rest of the flow on a
   slow network.
6. **Schema migrations are versioned SQL files**, not ad hoc dashboard
   edits. Use Postgres enums for status-like columns (e.g. visit status,
   ticket status) rather than free-text strings.
7. **Meter/cup-count readings are time-series and monotonic per machine**
   under normal operation — a new reading lower than the last recorded one
   should be flagged/rejected by validation, not silently accepted.
8. **Money and inventory math is unit-tested.** Par-level calculations,
   yield-monitor comparisons, FIFO/shrinkage logic, and PPM (preventive
   maintenance) triggers are pure functions and should have direct test
   coverage in the PR that introduces or changes them.

## Coding conventions

- **TypeScript everywhere**, strict mode. No `any` without a comment
  explaining why it's unavoidable.
- **Supabase client usage**: browser code uses the browser client
  (`lib/supabase/client.ts`), Server Components/Actions/Route Handlers use
  the server client (`lib/supabase/server.ts`), created fresh per request —
  never cache or module-scope a server client instance.
- **Auth/session refresh** happens in `apps/web/src/proxy.ts` (Next.js 16
  renamed `middleware.ts` → `proxy.ts`; exported function is `proxy`, not
  `middleware`). If a PR reintroduces a `middleware.ts` file, flag it as
  likely duplicate/conflicting logic.
- **Styling**: Tailwind v4 with `@theme inline` tokens defined in
  `globals.css` — coffee/espresso color palette (`espresso`, `crema`,
  `latte`, `copper`, `steam` token names). Don't introduce ad hoc hex
  colors in components; add a token if a new color is genuinely needed.
- **No business logic in JSX/components that belongs in a pure function** —
  par calculations, geofence checks, yield math, etc. live in testable
  modules, not inlined in a component.

## What to flag in PR review

- Missing or weak RLS policies on new/changed tables.
- Any client-side-only authorization check with no server-side or RLS
  enforcement behind it.
- Network calls in the mobile app with no offline/queue fallback.
- Skipping a step in the 8-step flow's enforced sequence.
- Hardcoded secrets, API keys, or Supabase service-role keys in any file
  that isn't `.env.local` (and `.env.local` itself should never be
  committed — check `.gitignore` covers it).
- New dependencies that duplicate something already in the stack (e.g. a
  second state-management library, a second date library).
- PRs that mix STRETCH-tagged feature work into an MVP-tagged ticket's
  scope without calling it out.
- Missing unit tests on new pure business-logic functions (par calc,
  yield monitor, FIFO/shrinkage, PPM trigger, geofence check).

## What NOT to flag

- Stylistic nitpicks already covered by ESLint/Prettier — defer to the
  linter, don't repeat its findings as prose comments.
- Suggesting alternate frameworks, package managers, or backend providers.
  The stack is fixed for this project's timeline.
- STRETCH-tagged scope being deferred or stubbed — that's expected, not a
  bug, unless it's silently dropped without being marked anywhere.

## Commands

- `npm install` — installs all workspaces from the repo root.
- `npm run typecheck` — typechecks all workspaces.
- `npm run lint` — lints all workspaces.
- `npm run dev:web` — runs the Next.js admin app locally.
- `npm run dev:mobile` — runs the Expo app locally.
- `npm run build:web` — production build of the admin app.

Run `typecheck` and `lint` before treating any PR as ready to merge — both
must be clean.

## Trust this file

Treat the information above as authoritative for this repository. Only
search the codebase for more context if something here is missing,
ambiguous, or appears to contradict what's actually in the code.
