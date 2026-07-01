"use client";

import { distanceMeters } from "@brewtracker/types";
import { useActionState } from "react";
import type { ReviewQueueItem } from "@/lib/time-clock/time-entry-service";
import { approveClockIn, flagClockIn, rejectClockIn } from "./actions";
import { initialReviewActionState } from "./action-state";

type ReviewCardProps = {
  entry: ReviewQueueItem;
};

const textareaClass =
  "min-h-24 rounded-xl border border-latte-200 bg-crema-0 px-4 py-2.5 text-sm text-espresso-950 outline-none focus:border-copper-500 focus:ring-2 focus:ring-copper-500/20";

export function ReviewCard({ entry }: ReviewCardProps) {
  const [approveState, approveAction] = useActionState(
    approveClockIn,
    initialReviewActionState,
  );

  const [flagState, flagAction] = useActionState(
    flagClockIn,
    initialReviewActionState,
  );

  const [rejectState, rejectAction] = useActionState(
    rejectClockIn,
    initialReviewActionState,
  );

  const hasClockInLocation =
    entry.clock_in_latitude != null && entry.clock_in_longitude != null;

  const hasWarehouseGeofence =
    entry.warehouse?.latitude != null &&
    entry.warehouse.longitude != null &&
    entry.warehouse.geofence_radius_meters != null;

  const distanceFromWarehouse =
    hasClockInLocation && hasWarehouseGeofence
      ? Math.round(
          distanceMeters(
            {
              latitude: entry.clock_in_latitude!,
              longitude: entry.clock_in_longitude!,
            },
            {
              latitude: entry.warehouse!.latitude!,
              longitude: entry.warehouse!.longitude!,
            },
          ),
        )
      : null;

  const outsideByMeters =
    distanceFromWarehouse != null &&
    entry.warehouse?.geofence_radius_meters != null
      ? Math.max(
          distanceFromWarehouse - entry.warehouse.geofence_radius_meters,
          0,
        )
      : null;

  const feedback =
    approveState.error ||
    approveState.success ||
    flagState.error ||
    flagState.success ||
    rejectState.error ||
    rejectState.success;

  const hasError = approveState.error || flagState.error || rejectState.error;

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold text-espresso-950">
            {entry.driver?.full_name ?? "Unknown driver"}
          </h3>

          <p className="text-sm text-steam-400">
            {entry.driver?.email ?? "No email"}
          </p>

          <p className="mt-1 text-sm text-steam-400">
            Clocked in:{" "}
            {entry.clock_in_at
              ? new Date(entry.clock_in_at).toLocaleString()
              : "Missing time"}
          </p>
        </div>

        <span className="rounded-full bg-copper-100 px-3 py-1 text-xs font-medium text-copper-600">
          Pending review
        </span>
      </div>

      <dl className="mb-5 grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-steam-400">Location</dt>
          <dd className="text-espresso-950">
            {entry.warehouse?.name ?? "Unknown warehouse"}
          </dd>
        </div>

        <div>
          <dt className="text-steam-400">Distance</dt>
          <dd className="text-espresso-950">
            {distanceFromWarehouse != null
              ? `${distanceFromWarehouse} m from warehouse`
              : "Missing location"}
          </dd>
        </div>

        <div>
          <dt className="text-steam-400">Geofence</dt>
          <dd className="text-espresso-950">
            {outsideByMeters != null
              ? outsideByMeters > 0
                ? `Outside by ${outsideByMeters} m`
                : "Inside geofence"
              : "Unavailable"}
          </dd>
        </div>

        <div>
          <dt className="text-steam-400">Override</dt>
          <dd className="text-espresso-950">
            {entry.is_geofence_override ? "Yes" : "No"}
          </dd>
        </div>

        <div>
          <dt className="text-steam-400">Reason</dt>
          <dd className="text-espresso-950">
            {entry.review_reason || entry.override_reason || "—"}
          </dd>
        </div>

        <div>
          <dt className="text-steam-400">Status</dt>
          <dd className="capitalize text-espresso-950">{entry.status}</dd>
        </div>
      </dl>

      {entry.clock_in_selfie_url && (
        <div className="mb-5">
          <p className="mb-2 text-sm font-medium text-espresso-950">
            Clock-in selfie
          </p>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.clock_in_selfie_url}
            alt="Clock-in selfie"
            className="max-h-64 rounded-xl border border-latte-200 object-cover"
          />
        </div>
      )}

      {feedback && (
        <p
          role={hasError ? "alert" : "status"}
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            hasError
              ? "bg-copper-100 text-copper-600"
              : "bg-latte-100 text-espresso-800"
          }`}
        >
          {feedback}
        </p>
      )}

      <div className="grid gap-3">
        <form action={approveAction} className="grid gap-3">
          <input type="hidden" name="timeEntryId" value={entry.id} />
          <textarea
            name="reviewNote"
            placeholder="Optional manager note"
            className={textareaClass}
          />

          <button className="rounded-full bg-espresso-950 px-4 py-2 text-sm font-medium text-crema-50 hover:bg-copper-600">
            Approve
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2">
          <form action={flagAction} className="grid gap-3">
            <input type="hidden" name="timeEntryId" value={entry.id} />
            <textarea
              name="reviewNote"
              placeholder="Reason for flagging"
              className={textareaClass}
            />

            <button className="rounded-full bg-latte-100 px-4 py-2 text-sm font-medium text-espresso-800 hover:bg-copper-100">
              Flag
            </button>
          </form>

          <form action={rejectAction} className="grid gap-3">
            <input type="hidden" name="timeEntryId" value={entry.id} />
            <textarea
              name="reviewNote"
              placeholder="Reason for rejection"
              className={textareaClass}
            />

            <button className="rounded-full bg-copper-100 px-4 py-2 text-sm font-medium text-copper-600 hover:bg-copper-100/70">
              Reject
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}