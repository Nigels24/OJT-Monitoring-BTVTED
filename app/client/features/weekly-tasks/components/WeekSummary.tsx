import type { WeeklyTaskWeek } from "@/lib/api/weeklyTaskApi";
import { MAX_TASK_RATING } from "@/lib/api/weeklyTaskApi";

interface WeekSummaryProps {
  summary: WeeklyTaskWeek["summary"];
}

/**
 * The week's counts and its average rating.
 *
 * The average is a plain number over the rated tasks only — no band, no label —
 * and it stands alone: it is not part of the supervisor's evaluation sheet or
 * the coordinator's grade.
 */
export default function WeekSummary({ summary }: WeekSummaryProps) {
  const cells: [string, string][] = [
    ["Tasks", String(summary.total)],
    ["Assigned", String(summary.assigned)],
    ["Done", String(summary.done)],
    ["Rated", String(summary.rated)],
    [
      "Week average",
      summary.averageRating === null
        ? "—"
        : `${summary.averageRating.toFixed(2)} / ${MAX_TASK_RATING}`,
    ],
  ];

  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            {label}
          </dt>
          <dd className="text-base font-bold text-gray-900 tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
