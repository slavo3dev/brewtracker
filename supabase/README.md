# BrewTracker Supabase

This directory contains BrewTracker database migrations and Supabase Edge Functions.

## FLOW-10 — Complete Service Visit

The `complete-service-visit` Edge Function is located at:

```text
supabase/functions/complete-service-visit/index.ts
```

It requires:

```text
RESEND_API_KEY
SERVICE_EMAIL_FROM
WEB_APP_URL
```

## Setup

BrewTracker development uses the **deployed Supabase Edge Function**. Local development does not require running `supabase functions serve`.

Set the secrets on the remote Supabase project:

```bash
npx supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY
```

```bash
npx supabase secrets set \
  SERVICE_EMAIL_FROM="BrewTracker <service@YOUR_VERIFIED_DOMAIN.com>"
```

```bash
npx supabase secrets set \
  WEB_APP_URL="https://YOUR_DEPLOYED_WEB_APP.com"
```

Verify the configured secrets:

```bash
npx supabase secrets list
```

Deploy the function:

```bash
npx supabase functions deploy complete-service-visit
```

## Development

Run BrewTracker normally:

```bash
npm run dev
```

The local application calls the deployed `complete-service-visit` Edge Function.

You **do not** need to run `supabase functions serve`.

If the Edge Function code changes, deploy it again:

```bash
npx supabase functions deploy complete-service-visit
```

## Production

For production, configure the production Supabase project with its production values for:

```text
RESEND_API_KEY
SERVICE_EMAIL_FROM
WEB_APP_URL
```

Then deploy `complete-service-visit` to the production project.

Never commit API keys or other secrets to Git.
