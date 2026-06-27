import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { getCurrentUserProfile } from "@/lib/auth/get-current-user";

const NAV_LINKS = [
  { label: "Routes", href: "#" },
  { label: "Service", href: "#" },
  { label: "Inventory", href: "#" },
  { label: "Reports", href: "#" },
];

export async function SiteHeader() {
  const profile = await getCurrentUserProfile();

  return (
    <header className="glass sticky top-0 z-50 border-b border-latte-200/60">
      <nav className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-espresso-950"
        >
          <BrewMark />
          BrewTracker
        </Link>

        <ul className="hidden items-center gap-8 text-[13px] font-medium text-espresso-800 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="transition-colors hover:text-copper-600"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          {profile ? (
            <>
              <span className="hidden text-[13px] font-medium text-steam-400 sm:block">
                {profile.full_name}
              </span>

              <form action={signOut}>
                <button
                  type="submit"
                  className="hidden text-[13px] font-medium text-espresso-800 transition-colors hover:text-copper-600 sm:block"
                >
                  Sign out
                </button>
              </form>

              <Link
                href="/dashboard"
                className="rounded-full bg-espresso-950 px-4 py-1.5 text-[13px] font-medium text-crema-50 transition-colors hover:bg-copper-600"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-[13px] font-medium text-espresso-800 transition-colors hover:text-copper-600 sm:block"
              >
                Sign in
              </Link>

              <Link
                href="/login"
                className="rounded-full bg-espresso-950 px-4 py-1.5 text-[13px] font-medium text-crema-50 transition-colors hover:bg-copper-600"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function BrewMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4 8h14v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M18 9.5h1.5a2.5 2.5 0 0 1 0 5H18"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 5c0-.7.5-1 .8-1.6M12 5c0-.7.5-1 .8-1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
