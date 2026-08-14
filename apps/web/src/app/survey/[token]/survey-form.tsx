"use client";

import { useState, useTransition } from "react";

import { submitSurvey } from "./actions";

type Props = {
  token: string;
};

export default function SurveyForm({ token }: Props) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);

  const [pending, startTransition] = useTransition();

  function handleSubmit(): void {
    if (!selectedRating) {
      setMessage("Choose a rating first.");

      return;
    }

    startTransition(() => {
      void submitSurvey(token, selectedRating).then((result) => {
        setMessage(result.message);

        if (result.success) {
          setSubmitted(true);
        }
      });
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-latte-100 p-5">
        <p className="font-medium text-espresso-950">Thank you.</p>

        <p className="mt-1 text-sm text-steam-400">
          Your feedback has been recorded.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            aria-label={`${rating} star rating`}
            onClick={() => {
              setSelectedRating(rating);

              setMessage(null);
            }}
            className={[
              "flex h-12 w-12 items-center justify-center rounded-xl border text-xl transition",
              selectedRating === rating
                ? "border-copper-500 bg-copper-100"
                : "border-latte-200 bg-crema-0",
            ].join(" ")}
          >
            ★
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!selectedRating || pending}
        onClick={handleSubmit}
        className="mt-6 w-full rounded-xl bg-copper-500 px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Submitting..." : "Submit rating"}
      </button>

      {message ? (
        <p className="mt-4 text-sm text-steam-400">{message}</p>
      ) : null}
    </div>
  );
}
