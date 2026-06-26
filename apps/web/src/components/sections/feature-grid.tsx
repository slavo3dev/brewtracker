const FEATURES = [
  {
    title: "Routes",
    description: "Plan stops, assign drivers, and track progress in real time as the day unfolds.",
  },
  {
    title: "Service workflow",
    description:
      "An eight-step checklist guides every visit, from arrival to the final quality check.",
  },
  {
    title: "AI quality gate",
    description:
      "Flag inconsistent service photos automatically, before they ever reach a manager.",
  },
  {
    title: "Inventory",
    description:
      "Track parts and supplies from warehouse to van to machine, without the guesswork.",
  },
];

export function FeatureGrid() {
  return (
    <section className="border-t border-latte-200 bg-latte-100 px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl bg-crema-0 p-6 shadow-[0_2px_8px_rgba(61,43,31,0.07)] ring-1 ring-espresso-950/[0.06] transition-shadow hover:shadow-[0_4px_16px_rgba(61,43,31,0.12)]"
            >
              <h3 className="text-display text-[19px] text-espresso-950">{feature.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-steam-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
