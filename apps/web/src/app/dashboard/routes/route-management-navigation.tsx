"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/dashboard/routes",
    label: "Today's Routes",
    description: "Daily operational routes",
    exact: true,
  },
  {
    href: "/dashboard/routes/templates",
    label: "Route Templates",
    description: "Recurring route schedules",
    exact: false,
  },
];

export function RouteManagementNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Route management"
      className="grid gap-2 rounded-2xl border border-latte-200 bg-crema-0 p-2 shadow-sm sm:grid-cols-2"
    >
      {items.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "rounded-xl px-4 py-3 transition-colors",
              isActive
                ? "bg-espresso-950 text-crema-50"
                : "text-espresso-800 hover:bg-latte-100",
            ].join(" ")}
          >
            <span className="block text-sm font-semibold">{item.label}</span>

            <span
              className={[
                "mt-0.5 block text-xs",
                isActive ? "text-crema-50/70" : "text-steam-400",
              ].join(" ")}
            >
              {item.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
