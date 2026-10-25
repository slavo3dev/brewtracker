export type NavigationLink = {
  label: string;
  href: string;
  description: string;
};

export type NavigationGroup = {
  label: string;
  links: NavigationLink[];
};

export const DASHBOARD_NAVIGATION: NavigationGroup[] = [
  {
    label: "Operations",
    links: [
      {
        label: "Routes",
        href: "/dashboard/routes",
        description:
          "Plan daily routes, assign drivers, and manage scheduled client visits.",
      },
      {
        label: "Service",
        href: "/dashboard/service",
        description:
          "Monitor service visits, review completed work, and track service activity.",
      },
      {
        label: "Live Fleet Map",
        href: "/dashboard/fleet",
        description:
          "Track active drivers and vehicles using real-time GPS locations.",
      },
      {
        label: "Time Clock",
        href: "/dashboard/time-clock",
        description:
          "Review employee attendance, clock-in records, and working hours.",
      },
    ],
  },
  {
    label: "Inventory",
    links: [
      {
        label: "Inventory Overview",
        href: "/dashboard/inventory",
        description:
          "Manage inventory products, stock movements, and inventory operations.",
      },
      {
        label: "Warehouses",
        href: "/dashboard/inventory/warehouses",
        description:
          "Manage warehouse locations and organize inventory storage.",
      },
      {
        label: "Machines",
        href: "/dashboard/inventory/machines",
        description:
          "Manage coffee machines, their assignments, and equipment details.",
      },
    ],
  },
  {
    label: "Management",
    links: [
      {
        label: "Clients",
        href: "/dashboard/clients",
        description:
          "Manage client locations, business details, and assigned inventory products.",
      },
      {
        label: "Users",
        href: "/dashboard/users",
        description:
          "Manage employees, user accounts, roles, and access permissions.",
      },
    ],
  },
  {
    label: "Reports",
    links: [
      {
        label: "Reports",
        href: "/dashboard/reports",
        description:
          "View operational reports and analyze service and business performance.",
      },
    ],
  },
];
