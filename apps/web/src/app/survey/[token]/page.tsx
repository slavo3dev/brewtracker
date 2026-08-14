import SurveyForm from "./survey-form";

type Props = {
  params: Promise<{
    token: string;
  }>;
};

export default async function SurveyPage({ params }: Props) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-crema-50 px-4 py-16">
      <section className="mx-auto max-w-lg rounded-3xl border border-latte-200 bg-crema-0 p-8 shadow-sm">
        <p className="text-sm font-medium text-copper-600">BrewTracker</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-espresso-950">
          How was your service?
        </h1>

        <p className="mt-3 text-sm leading-6 text-steam-400">
          Rate your recent service visit from 1 to 5 stars.
        </p>

        <div className="mt-8">
          <SurveyForm token={token} />
        </div>
      </section>
    </main>
  );
}
