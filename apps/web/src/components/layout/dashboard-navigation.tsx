import Link from "next/link";
import { DASHBOARD_NAVIGATION } from "./navigation.config";

export function DashboardNavigation() {
  return (
    <>
      {/* Desktop navigation */}
      <div className="hidden items-center gap-5 md:flex">
        {DASHBOARD_NAVIGATION.map((group) => (
          <details key={group.label} className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-espresso-800 transition-colors hover:text-copper-600 [&::-webkit-details-marker]:hidden">
              {group.label}
              <span
                aria-hidden="true"
                className="text-[10px] transition-transform group-open:rotate-180"
              >
                ▼
              </span>
            </summary>

            <div className="absolute left-0 top-full z-50 min-w-48 pt-3">
              <div className="rounded-xl border border-latte-200 bg-crema-0 p-2 shadow-lg">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-3 py-2 text-sm text-espresso-800 transition-colors hover:bg-latte-100 hover:text-copper-600"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>

      {/* Mobile navigation */}
      <details className="group relative md:hidden">
        <summary className="cursor-pointer list-none rounded-lg border border-latte-200 px-3 py-1.5 text-sm font-medium text-espresso-800 [&::-webkit-details-marker]:hidden">
          Menu
        </summary>

        <div className="absolute right-0 top-full z-50 mt-3 max-h-[75vh] w-64 overflow-y-auto rounded-xl border border-latte-200 bg-crema-0 p-4 shadow-lg">
          {DASHBOARD_NAVIGATION.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steam-400">
                {group.label}
              </p>

              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm text-espresso-800 hover:bg-latte-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
