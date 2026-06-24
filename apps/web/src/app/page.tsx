import { FeatureGrid } from "@/components/sections/feature-grid";

export default function Home() {
  return (
    <>
      <section className="pour-glow relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pt-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-copper-600">
            Reliant Field Operations
          </p>
          <h1 className="text-display text-balance text-5xl text-espresso-950 sm:text-6xl md:text-7xl">
            Every machine.
            <br />
            Every stop. Counted.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-steam-400 sm:text-xl">
            BrewTracker brings routes, service, and inventory into one system built for the people
            keeping coffee machines running.
          </p>
          <div className="mt-9 flex items-center justify-center gap-4">
            <a
              href="#"
              className="rounded-full bg-espresso-950 px-6 py-3 text-[15px] font-medium text-crema-50 transition-colors hover:bg-copper-600"
            >
              Get started
            </a>
            <a
              href="#"
              className="text-[15px] font-medium text-espresso-800 transition-colors hover:text-copper-600"
            >
              See how it works &rsaquo;
            </a>
          </div>
        </div>
      </section>

      <FeatureGrid />
    </>
  );
}
