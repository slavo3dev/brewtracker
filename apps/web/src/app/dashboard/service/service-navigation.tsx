"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  {
    label: "Technical Issues",
    href: "/dashboard/service",
  },
  {
    label: "Service Visits",
    href: "/dashboard/service/visits",
  },
] as const;

export function ServiceNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Service sections"
      className="mt-7 border-b border-latte-200"
    >
      <div className="flex gap-6">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard/service"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-copper-600 text-copper-600"
                  : "border-transparent text-steam-400 hover:border-latte-300 hover:text-espresso-800",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
