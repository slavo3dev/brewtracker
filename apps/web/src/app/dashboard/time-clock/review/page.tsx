import { canReviewClockIns } from "@brewtracker/types";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/get-current-user";
import { getTimeEntryReviewQueue } from "@/lib/time-clock/time-entry-service";
import { ReviewCard } from "./review-card";

export default async function ClockInReviewPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!canReviewClockIns(profile)) {
    redirect("/dashboard");
  }

  const reviewItems = await getTimeEntryReviewQueue();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-display text-3xl text-espresso-950">
          Clock-in review
        </h1>

        <p className="mt-2 text-sm text-steam-400">
          Review clock-ins that require manager approval or follow-up.
        </p>
      </header>

      {reviewItems.length === 0 ? (
        <div className="rounded-2xl border border-latte-200 bg-crema-0 p-6 text-sm text-steam-400">
          No pending clock-ins to review.
        </div>
      ) : (
        <section className="grid gap-4">
          {reviewItems.map((entry) => (
            <ReviewCard key={entry.id} entry={entry} />
          ))}
        </section>
      )}
    </main>
  );
}