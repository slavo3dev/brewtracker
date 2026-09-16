import type { ServiceVisitListItem } from "./service-visit.types";

type Props = {
  visit: ServiceVisitListItem;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(
  arrivedAt: string | null,
  completedAt: string | null,
): string {
  if (!arrivedAt) {
    return "—";
  }

  if (!completedAt) {
    return "In progress";
  }

  const arrivalTime = Date.parse(arrivedAt);
  const completionTime = Date.parse(completedAt);

  if (
    Number.isNaN(arrivalTime) ||
    Number.isNaN(completionTime) ||
    completionTime < arrivalTime
  ) {
    return "—";
  }

  const totalSeconds = Math.floor((completionTime - arrivalTime) / 1000);

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getStatusLabel(status: ServiceVisitListItem["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";

    case "in_progress":
      return "In Progress";

    case "completed":
      return "Completed";

    case "skipped":
      return "Skipped";
  }
}

function getStatusClass(status: ServiceVisitListItem["status"]): string {
  switch (status) {
    case "pending":
      return "bg-steam-100 text-steam-400";

    case "in_progress":
      return "bg-copper-100 text-copper-600";

    case "completed":
      return "bg-emerald-50 text-emerald-700";

    case "skipped":
      return "bg-latte-100 text-espresso-800";
  }
}

export function ServiceVisitCard({ visit }: Props) {
  const machineLabel =
    visit.machine?.name ?? visit.machine?.serialNumber ?? "No machine";

  return (
    <article className="rounded-2xl border border-latte-200 bg-crema-0 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-copper-600">
            Service visit
          </p>

          <h3 className="mt-1 text-lg font-semibold text-espresso-950">
            {visit.client.name}
          </h3>

          <p className="mt-1 text-sm text-steam-400">
            {machineLabel}

            {visit.machine?.serialNumber && visit.machine.name
              ? ` · ${visit.machine.serialNumber}`
              : ""}
          </p>
        </div>

        <span
          className={[
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            getStatusClass(visit.status),
          ].join(" ")}
        >
          {getStatusLabel(visit.status)}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-latte-200 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-steam-400">Driver</dt>

          <dd className="mt-1 font-medium text-espresso-800">
            {visit.driver.fullName}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-steam-400">Arrived</dt>

          <dd className="mt-1 font-medium text-espresso-800">
            {formatDateTime(visit.arrivedAt)}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-steam-400">Completed</dt>

          <dd className="mt-1 font-medium text-espresso-800">
            {visit.completedAt
              ? formatDateTime(visit.completedAt)
              : "In progress"}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-steam-400">Time on location</dt>

          <dd className="mt-1 font-semibold text-espresso-950">
            {formatDuration(visit.arrivedAt, visit.completedAt)}
          </dd>
        </div>
      </dl>
    </article>
  );
}
