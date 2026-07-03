import { MockupPage } from "@/components/sections/mockup-page";

export default function AIQualityPage() {
  return (
    <MockupPage
      eyebrow="AI Quality Gate"
      title="Review every service visit with AI-assisted quality control."
      description="This mockup represents the future AI Quality Gate, helping managers identify inconsistent service visits, review before-and-after photos, and maintain service standards across every customer location."
      cards={[
        {
          title: "Photo Review Queue",
          description:
            "Managers review flagged before-and-after service photos before approving completed visits.",
        },
        {
          title: "AI Cleanliness Scoring",
          description:
            "Future computer vision models will evaluate machine cleanliness and highlight potential issues automatically.",
        },
        {
          title: "Object Detection",
          description:
            "Detect missing parts, incorrect machine setup, and other visual inconsistencies during every service visit.",
        },
        {
          title: "Quality Analytics",
          description:
            "Track approval rates, recurring issues, and overall service quality across drivers, regions, and customer locations.",
        },
      ]}
    />
  );
}