import { canAccessAdminApp } from "@brewtracker/types";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes that don't require a signed-in session.
const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/reset-password"];

// Keeps the Supabase auth session fresh on every request, and redirects
// unauthenticated visitors away from protected admin routes.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if expired. Required for Server Components,
  // which can't write cookies themselves.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    pathname.startsWith(path),
  );

  const isDashboardPath = pathname.startsWith("/dashboard");

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
   loginUrl.searchParams.set(
      "redirectTo",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (user && isDashboardPath) {
    const { data: profile } = await supabase
      .from("users")
      .select("id, role, region, is_active")
      .eq("id", user.id)
      .single();

    if (!canAccessAdminApp(profile)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
