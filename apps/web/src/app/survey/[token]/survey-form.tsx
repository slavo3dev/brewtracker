"use client";

import {
  useState,
  useTransition,
} from "react";

import { submitSurvey } from "./actions";

type Props = {
  token: string;
  googleReviewUrl: string | null;
};

type SubmissionState =
  | "idle"
  | "created"
  | "already_submitted";

export default function SurveyForm({
  token,
  googleReviewUrl,
}: Props) {
  const [
    selectedRating,
    setSelectedRating,
  ] = useState<number | null>(null);

  const [
    submittedRating,
    setSubmittedRating,
  ] = useState<number | null>(null);

  const [
    submissionState,
    setSubmissionState,
  ] = useState<SubmissionState>("idle");

  const [message, setMessage] =
    useState<string | null>(null);

  const [pending, startTransition] =
    useTransition();

  function handleSubmit(): void {
    if (!selectedRating) {
      setMessage("Choose a rating first.");
      return;
    }

    const rating = selectedRating;

    startTransition(() => {
      void submitSurvey(
        token,
        rating,
      ).then((result) => {
        setMessage(result.message);

        if (!result.success) {
          return;
        }

        /*
         * Only a newly created rating gets the normal
         * submission success experience.
         */
        if (result.status === "created") {
          setSubmittedRating(rating);
          setSubmissionState("created");
          return;
        }

        /*
         * Existing feedback is a different UI state.
         *
         * Do NOT use the newly selected rating here.
         * Otherwise someone selecting 5 stars on an
         * already-rated survey would incorrectly trigger
         * the five-star animation.
         */
        if (
          result.status ===
          "already_submitted"
        ) {
          setSubmittedRating(null);
          setSubmissionState(
            "already_submitted",
          );
        }
      });
    });
  }

  /*
   * Existing survey.
   *
   * Deliberately no star animation and no claim that
   * the newly selected rating was recorded.
   */
  if (
    submissionState ===
    "already_submitted"
  ) {
    return (
      <div className="text-center">
        <div className="rounded-2xl bg-latte-100 p-5">
          <p className="font-medium text-espresso-950">
            Feedback already received
          </p>

          <p className="mt-1 text-sm leading-6 text-steam-400">
            Feedback for this service visit
            has already been recorded.
          </p>
        </div>
      </div>
    );
  }

  /*
   * Genuine new submission.
   */
  if (submissionState === "created") {
    const isFiveStar =
      submittedRating === 5;

    return (
      <div className="text-center">
        {isFiveStar ? (
          <div
            className="mb-5 flex justify-center gap-1"
            aria-hidden="true"
          >
            {[1, 2, 3, 4, 5].map(
              (star, index) => (
                <span
                  key={star}
                  className="animate-[review-star_500ms_ease-out_both] text-3xl text-copper-500"
                  style={{
                    animationDelay:
                      `${index * 80}ms`,
                  }}
                >
                  ★
                </span>
              ),
            )}
          </div>
        ) : null}

        <div className="rounded-2xl bg-latte-100 p-5">
          <p className="font-medium text-espresso-950">
            Thank you.
          </p>

          <p className="mt-1 text-sm text-steam-400">
            Your feedback has been recorded.
          </p>
        </div>

        {isFiveStar && googleReviewUrl ? (
          <div className="mt-6">
            <p className="mb-4 text-sm leading-6 text-steam-400">
              We're glad you had a great experience.
              If you'd like, you can also share your
              experience on Google.
            </p>

            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl bg-copper-500 px-5 py-3 font-medium text-white transition hover:opacity-90"
            >
              Leave a Google Review
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(
          (rating) => {
            const selected =
              selectedRating !== null &&
              rating <= selectedRating;

            return (
              <button
                key={rating}
                type="button"
                aria-label={`${rating} star rating`}
                aria-pressed={
                  selectedRating === rating
                }
                onClick={() => {
                  setSelectedRating(
                    rating,
                  );

                  setMessage(null);
                }}
                className={[
                  "flex h-12 w-12 items-center justify-center rounded-xl border text-xl transition",

                  selected
                    ? "border-copper-500 bg-copper-100 text-copper-600"
                    : "border-latte-200 bg-crema-0 text-steam-400",
                ].join(" ")}
              >
                ★
              </button>
            );
          },
        )}
      </div>

      <button
        type="button"
        disabled={
          !selectedRating ||
          pending
        }
        onClick={handleSubmit}
        className="mt-6 w-full rounded-xl bg-copper-500 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {pending
          ? "Submitting..."
          : "Submit rating"}
      </button>

      {message ? (
        <p className="mt-4 text-sm text-steam-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}