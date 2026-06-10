import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@brewtracker/types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Use this inside Server Components, Route Handlers, and Server Actions.
// Must be called fresh on every request — do not cache the client instance.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without a writable cookie store
            // (e.g. during static rendering). Safe to ignore if you have
            // middleware refreshing sessions — see middleware.ts.
          }
        },
      },
    }
  );
}
