// apps/web/src/components/sections/mockup-page.tsx

import Link from "next/link";

type MockupPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  cards: {
    title: string;
    description: string;
  }[];
};

export function MockupPage({
  eyebrow,
  title,
  description,
  cards,
}: MockupPageProps) {
  return (
    <main className="px-4 py-24 sm:px-6">
      <section className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="text-[14px] font-medium text-copper-600 hover:text-copper-500"
        >
          ← Back home
        </Link>

        <p className="mt-10 text-[13px] font-semibold uppercase tracking-[0.12em] text-copper-600">
          {eyebrow}
        </p>

        <h1 className="text-display mt-4 max-w-3xl text-5xl text-espresso-950 sm:text-6xl">
          {title}
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-steam-400">
          {description}
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-3xl bg-crema-0 p-6 shadow-[0_2px_8px_rgba(61,43,31,0.07)] ring-1 ring-espresso-950/[0.06]"
            >
              <h2 className="text-display text-2xl text-espresso-950">
                {card.title}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-steam-400">
                {card.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}