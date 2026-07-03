// apps/web/src/app/get-started/page.tsx

import { MockupPage } from "@/components/sections/mockup-page";

export default function GetStartedPage() {
  return (
    <MockupPage
      eyebrow="Onboarding"
      title="Start running field operations from one clean dashboard."
      description="This mockup page will later become the entry point for managers to configure warehouses, drivers, routes, and service workflows."
      cards={[
        {
          title: "Create operations setup",
          description: "Add warehouses, regions, users, machines, and route defaults.",
        },
        {
          title: "Invite internal team",
          description: "Managers and CEOs are created internally instead of public signup.",
        },
      ]}
    />
  );
}