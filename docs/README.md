# BrewTracker Docs

Internal documentation for the BrewTracker monorepo. This folder is
never bundled into apps/web or apps/mobile builds — it's reference
material only.

## Contents

- `setup.md` — local dev environment setup
- `architecture.md` — monorepo structure, tech decisions
- `tickets/` — ticket specs as they're built (mirrors Jira)

# BrewTracker

Field operations platform for Reliant — route management, 8-step
service workflow, AI photo QC, inventory tracking, and CEO reporting.

## Stack

- **Web admin:** Next.js 16 (App Router), TypeScript, Tailwind v4
- **Mobile:** Expo / React Native, TypeScript
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Monorepo:** npm workspaces

## Quick start

\`\`\`bash
npm install
cp apps/web/.env.local.example apps/web/.env.local # fill in Supabase keys
cp apps/mobile/.env.example apps/mobile/.env # fill in Supabase keys
npm run dev:web # Next.js → http://localhost:3000
npm run dev:mobile # Expo → scan QR with Expo Go, or press i / a
\`\`\`

## Structure

\`\`\`
apps/web Next.js admin dashboard
apps/mobile Expo field-tech mobile app
packages/types Shared Supabase-generated TypeScript types
docs/ Internal documentation (not bundled in any build)
\`\`\`

## Common commands

| Command              | Does what                |
| -------------------- | ------------------------ |
| `npm run dev:web`    | Start Next.js dev server |
| `npm run dev:mobile` | Start Expo dev server    |
| `npm run typecheck`  | Typecheck all workspaces |
| `npm run lint`       | Lint all workspaces      |

See `/docs/setup.md` for full environment setup and `/docs/architecture.md` for design decisions.

---

Powered by Prototype.NEXT & Slavo.io
