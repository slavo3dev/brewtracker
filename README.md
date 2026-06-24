# BrewTracker

Monorepo for the Reliant field operations platform — admin dashboard (Next.js) + driver/tech mobile app (Expo, coming later) sharing one set of TypeScript types generated from Supabase.

## Structure

```
brewtracker/
├── apps/
│   └── web/          Next.js admin dashboard (App Router, TypeScript, Tailwind)
│   └── mobile/        (Expo app — added later, see Epic 0 tickets)
├── packages/
│   └── types/         Shared TypeScript types, generated from the Supabase schema
└── package.json        npm workspaces root
```

## First-time setup (do this once)

1. Install Node.js 20+ (check with `node --version`)
2. Clone the repo, then from the repo root:
   ```bash
   npm install
   ```
   This installs dependencies for every app/package in the monorepo in one shot — you don't need to `cd` into `apps/web` and install separately.
3. Set up your Supabase env vars:

   ```bash
   cp apps/web/.env.local.example apps/web/.env.local
   ```

   Then open `apps/web/.env.local` and fill in the real `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values. Get these from the Supabase Dashboard → your project → Project Settings → API. Ask whoever set up the Supabase project for these if you don't have access yet.

   **`.env.local` is gitignored on purpose — never commit it.** Each dev keeps their own copy.

## Day-to-day

Run the web app in dev mode:

```bash
npm run dev:web
```

Opens at http://localhost:3000

Typecheck everything:

```bash
npm run typecheck
```

Build for production:

```bash
npm run build:web
```

## Updating shared types after a schema change

Whenever the Supabase database schema changes (new table, new column, etc.), regenerate the shared types so both `apps/web` and the future `apps/mobile` see the change:

```bash
npx supabase gen types typescript --project-id <your-project-id> > packages/types/src/database.ts
```

Then update `packages/types/src/index.ts` to export from that generated file instead of the placeholder. Commit the regenerated file — it's how the rest of the team picks up schema changes without manually editing types by hand.

## Adding the mobile app later

When you're ready to start the Expo app (see Epic 0 / FOUND-5 in the ticket backlog), it goes in `apps/mobile` as a sibling to `apps/web`, also depending on `@brewtracker/types`. Ask Claude to scaffold it the same way this one was scaffolded.
