import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatWeekRange, weekEndKey } from "../week";

interface WeekNavigatorProps {
  /** The Monday of the week being shown, `yyyy-mm-dd`. */
  weekStart: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisWeek: () => void;
}

/** Previous / next week, Monday to Sunday, with a way back to this week. */
export default function WeekNavigator({
  weekStart,
  isCurrentWeek,
  onPrev,
  onNext,
  onThisWeek,
}: WeekNavigatorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onPrev}
        className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="min-w-44 text-center" aria-live="polite">
        <p className="text-sm font-semibold text-gray-900">
          {formatWeekRange(weekStart, weekEndKey(weekStart))}
        </p>
        <p className="text-[11px] text-gray-500">
          {isCurrentWeek ? "This week" : "Monday to Sunday"}
        </p>
      </div>
      <button
        type="button"
        onClick={onNext}
        className="p-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={onThisWeek}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          This week
        </button>
      )}
    </div>
  );
}
