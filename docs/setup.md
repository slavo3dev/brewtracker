# Local Setup

## Prerequisites

- Node.js 20+
- npm 10+
- Expo Go app (iOS/Android) or Xcode/Android Studio for simulators
- Supabase project credentials (ask team lead)

## Install

\`\`\`bash
git clone <repo-url>
cd brewtracker
npm install
\`\`\`

## Environment variables

Web:
\`\`\`bash
cp apps/web/.env.local.example apps/web/.env.local

# fill in NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY

\`\`\`

Mobile:
\`\`\`bash
cp apps/mobile/.env.example apps/mobile/.env

# fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY

\`\`\`

## Run

\`\`\`bash
npm run dev:web # http://localhost:3000
npm run dev:mobile # opens Expo dev tools / QR code
\`\`\`

## Verify

\`\`\`bash
npm run typecheck
npm run lint
\`\`\`
