// apps/web/src/app/how-it-works/page.tsx

import { MockupPage } from "@/components/sections/mockup-page";

export default function HowItWorksPage() {
  return (
    <MockupPage
      eyebrow="Workflow"
      title="Routes, service visits, inventory, and reporting work together."
      description="This page explains the product flow from route planning to driver service completion and manager review."
      cards={[
        {
          title: "Plan the route",
          description: "Managers assign stops and drivers for the day.",
        },
        {
          title: "Complete service",
          description: "Drivers follow the required on-site workflow step by step.",
        },
        {
          title: "Review results",
          description: "Managers review exceptions, photos, inventory movement, and reports.",
        },
      ]}
    />
  );
}