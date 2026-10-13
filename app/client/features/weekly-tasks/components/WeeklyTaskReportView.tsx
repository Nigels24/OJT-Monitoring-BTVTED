"use client";

import PrintPage from "@/components/ui/PrintPage";
import type { WeeklyTaskWeek } from "@/lib/api/weeklyTaskApi";
import WeeklyTaskReportSheet from "./WeeklyTaskReportSheet";

interface WeeklyTaskReportViewProps {
  /** `undefined` while loading, or when this role cannot see the placement. */
  report: WeeklyTaskWeek | undefined;
  isLoading: boolean;
  backHref: string;
  backLabel: string;
}

/**
 * The print view of one placement's week, shared by all three roles.
 *
 * Which placements a role may open is decided by the server — each page
 * fetches through its own role's endpoint, and a refusal lands on the "not
 * available" state below.
 */
export default function WeeklyTaskReportView({
  report,
  isLoading,
  backHref,
  backLabel,
}: WeeklyTaskReportViewProps) {
  const printable =
    !isLoading && report && report.assignment && report.student
      ? { ...report, assignment: report.assignment, student: report.student }
      : null;

  return (
    <PrintPage
      backHref={backHref}
      backLabel={backLabel}
      canPrint={!!printable}
      framed={!!printable}
    >
      {isLoading ? (
        <p className="text-sm text-gray-500 py-12 text-center">
          Loading the weekly task report...
        </p>
      ) : !printable ? (
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-sm text-gray-700">
            This weekly task report is not available. The placement may not
            exist, or it is not one you have access to.
          </p>
        </div>
      ) : (
        <WeeklyTaskReportSheet report={printable} />
      )}
    </PrintPage>
  );
}
