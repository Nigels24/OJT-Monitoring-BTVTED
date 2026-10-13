import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ListChecks, Printer } from "lucide-react";
import { useGetCoordinatorWeekQuery } from "@/lib/api/weeklyTaskApi";
import { manilaTodayKey, readApiError, shiftWeek, weekStartKey } from "../week";
import WeekNavigator from "./WeekNavigator";
import WeekSummary from "./WeekSummary";
import WeeklyTaskCard from "./WeeklyTaskCard";

interface PlacementWeeklyTasksProps {
  assignmentId: string;
}

/**
 * The coordinator's read-only view of one placement's weekly tasks: what the
 * supervisor assigned, the trainee's proof, and the ratings.
 *
 * Collapsed until asked for, so opening a student with several placements does
 * not fetch a week for each. There are no actions here because the coordinator
 * has none — the server exposes no write route for this role.
 */
export default function PlacementWeeklyTasks({
  assignmentId,
}: PlacementWeeklyTasksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentWeek = weekStartKey(manilaTodayKey());
  const [week, setWeek] = useState(currentWeek);

  const { data, isFetching, error } = useGetCoordinatorWeekQuery(
    { assignmentId, week },
    { skip: !isOpen },
  );

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
        }}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <ListChecks size={15} className="text-blue-600" />
          Weekly Tasks
        </span>
        {isOpen ? (
          <ChevronUp size={16} className="text-gray-500" />
        ) : (
          <ChevronDown size={16} className="text-gray-500" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-500">
            Assigned and rated by the company supervisor. Read-only here, and
            separate from the evaluation sheet and your grade.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <WeekNavigator
              weekStart={week}
              isCurrentWeek={week === currentWeek}
              onPrev={() => {
                setWeek((current) => shiftWeek(current, -1));
              }}
              onNext={() => {
                setWeek((current) => shiftWeek(current, 1));
              }}
              onThisWeek={() => {
                setWeek(currentWeek);
              }}
            />
            <Link
              href={`/coordinator/weekly-tasks/print?assignment=${assignmentId}&week=${week}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
            >
              <Printer size={12} /> Print weekly report
            </Link>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {readApiError(error, "Could not load this week's tasks.")}
            </p>
          ) : !data || isFetching ? (
            <p className="text-sm text-gray-400">Loading tasks...</p>
          ) : (
            <>
              <WeekSummary summary={data.summary} />
              {data.tasks.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No tasks were assigned for this week.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.tasks.map((task) => (
                    <WeeklyTaskCard key={task.id} task={task} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
